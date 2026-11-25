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

    @Override
    public void load() {
        try {
            server = LanServer.startOnFreePort(
                path -> getContext().getAssets().open("public/" + path),
                new LanServer.Events() {
                    public void onAction(String name) { JSObject o = new JSObject(); o.put("name", name); notifyListeners("action", o); }
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
