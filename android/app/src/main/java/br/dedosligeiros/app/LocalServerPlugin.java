package br.dedosligeiros.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/** Exposes LanServer to the game page (see src/js/remote-android.js). */
@CapacitorPlugin(name = "LocalServer")
public class LocalServerPlugin extends Plugin {
    private LanServer server;
    private String error;

    /** Starts hosting (role "jogador"). Safe to call more than once. */
    @PluginMethod
    public void start(PluginCall call) {
        startServer();
        call.resolve(info());
    }

    /** Stops hosting (role "professor"). */
    @PluginMethod
    public void stop(PluginCall call) {
        if (server != null) { server.shutdown(); server = null; }
        call.resolve();
    }

    /** Professor: games announcing themselves on this Wi-Fi, as "ip:port". */
    @PluginMethod
    public void scan(PluginCall call) {
        int ms = call.getInt("ms", 2500);
        getBridge().execute(() -> {
            android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) getContext().getApplicationContext().getSystemService(android.content.Context.WIFI_SERVICE);
            android.net.wifi.WifiManager.MulticastLock lock = null;
            try {
                if (wm != null) { lock = wm.createMulticastLock("dedos-ligeiros"); lock.setReferenceCounted(false); lock.acquire(); }
                List<String> hosts = Beacon.listen(Math.max(500, Math.min(ms, 10000)));
                JSObject o = new JSObject();
                com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
                for (String h : hosts) arr.put(h);
                o.put("hosts", arr);
                call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage());
            } finally {
                if (lock != null) lock.release();
            }
        });
    }

    private synchronized void startServer() {
        if (server != null) return;
        error = null;
        try {
            server = LanServer.startOnFreePort(
                path -> getContext().getAssets().open("public/" + path),
                new LanServer.Events() {
                    public void onAction(String name, Object arg) { JSObject o = new JSObject(); o.put("name", name); if (arg != null) o.put("arg", arg); notifyListeners("action", o); }
                    public void onRequest(int cid, int id, String m, String a) { JSObject o = new JSObject(); o.put("cid", cid); o.put("id", id); o.put("m", m); o.put("a", a); notifyListeners("req", o); }
                    public void onConfig(String key, Object value) { JSObject o = new JSObject(); o.put("key", key); o.put("value", value); notifyListeners("config", o); }
                    public void onClients(int count) { JSObject o = new JSObject(); o.put("count", count); notifyListeners("clients", o); }
                });
        } catch (Exception e) {
            error = e.getMessage();
        }
    }

    private JSObject info() {
        JSObject o = new JSObject();
        List<String> ips = LanServer.lanAddresses();
        String ip = ips.isEmpty() ? null : ips.get(0);
        if (server != null) {
            o.put("code", server.getCode());
            o.put("port", server.getListeningPort());
            o.put("clients", server.getClientCount());
            if (ip != null) o.put("url", "http://" + ip + ":" + server.getListeningPort() + "/?c=" + server.getCode());
        }
        if (ip != null) o.put("ip", ip);
        if (error != null) o.put("error", error);
        return o;
    }

    @PluginMethod
    public void info(PluginCall call) { call.resolve(info()); }

    @PluginMethod
    public void newCode(PluginCall call) {
        if (server != null) server.regenerateCode();
        call.resolve(info());
    }

    @PluginMethod
    public void reply(PluginCall call) {
        Integer cid = call.getInt("cid"), id = call.getInt("id");
        String payload = call.getString("payload");
        if (server != null && cid != null && id != null && payload != null) server.reply(cid, id, payload);
        call.resolve();
    }

    /* ---------- children's data: one small file in the app's private storage ---------- */
    private java.io.File dataFile() { return new java.io.File(getContext().getFilesDir(), "alunos.json"); }

    @PluginMethod
    public void loadData(PluginCall call) {
        JSObject o = new JSObject();
        java.io.File f = dataFile();
        if (f.exists()) {
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                o.put("text", new String(bo.toByteArray(), java.nio.charset.StandardCharsets.UTF_8));
            } catch (Exception e) { call.reject(e.getMessage()); return; }
        }
        call.resolve(o);
    }

    @PluginMethod
    public void saveData(PluginCall call) {
        String text = call.getString("text");
        if (text == null) { call.reject("sem dados"); return; }
        java.io.File f = dataFile(), tmp = new java.io.File(f.getPath() + ".tmp");
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
            out.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) { call.reject(e.getMessage()); return; }
        if (f.exists()) f.renameTo(new java.io.File(f.getPath() + ".bak"));
        if (!tmp.renameTo(f)) { call.reject("não salvou"); return; }
        call.resolve();
    }

    /* ---------- report: Android print screen, where "Salvar como PDF" is an option ---------- */
    private android.webkit.WebView printView;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String name = call.getString("name", "Relatorio");
        if (html == null) { call.reject("sem conteúdo"); return; }
        getActivity().runOnUiThread(() -> {
            android.webkit.WebView wv = new android.webkit.WebView(getActivity());
            wv.getSettings().setAllowFileAccess(true);
            printView = wv;
            wv.setWebViewClient(new android.webkit.WebViewClient() {
                @Override
                public void onPageFinished(android.webkit.WebView view, String url) {
                    android.print.PrintManager pm = (android.print.PrintManager) getActivity().getSystemService(android.content.Context.PRINT_SERVICE);
                    android.print.PrintAttributes attrs = new android.print.PrintAttributes.Builder()
                        .setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4).build();
                    pm.print(name, view.createPrintDocumentAdapter(name), attrs);
                    call.resolve();
                }
            });
            wv.loadDataWithBaseURL("file:///android_asset/public/", html, "text/html", "UTF-8", null);
        });
    }

    @PluginMethod
    public void sendState(PluginCall call) {
        String s = call.getString("state");
        if (server != null && s != null) server.setState(s);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (server != null) server.shutdown();
    }
}
