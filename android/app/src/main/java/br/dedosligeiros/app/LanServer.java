package br.dedosligeiros.app;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

/**
 * Local server for Mode 1 on the tablet (same protocol as electron/server.js):
 * serves the phone page from the app assets and relays phone actions over a WebSocket.
 * Plain Java (no Android classes) so it can be tested off-device.
 */
public class LanServer extends NanoWSD {
    public interface Assets { InputStream open(String path) throws IOException; }
    public interface Events {
        void onAction(String name);
        void onConfig(String key, Object value);
        void onClients(int count);
    }

    public static final int[] PORTS = {8787, 8788, 8789, 8790, 8791};
    private static final String[] ACTIONS = {"correct", "repeat", "skip", "back", "pause", "quit", "start", "home"};
    private static final String[] CONFIG_KEYS = {"digits", "rounds", "voice", "sound"};

    private final Assets assets;
    private final Events events;
    private final Set<Client> clients = new CopyOnWriteArraySet<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private volatile String code = newCode();
    private volatile String state = null;

    public LanServer(int port, Assets assets, Events events) {
        super(port);
        this.assets = assets;
        this.events = events;
    }

    public static LanServer startOnFreePort(Assets assets, Events events) throws IOException {
        IOException last = null;
        for (int p : PORTS) {
            LanServer s = new LanServer(p, assets, events);
            try {
                s.start(0, true); // no read timeout: WebSockets stay open
                s.timer.scheduleAtFixedRate(s::heartbeat, 10, 10, TimeUnit.SECONDS);
                s.timer.scheduleAtFixedRate(s::beacon, 0, 1, TimeUnit.SECONDS);
                return s;
            } catch (IOException e) { last = e; }
        }
        throw last != null ? last : new IOException("Nenhuma porta livre");
    }

    private java.net.DatagramSocket beaconSock;
    private void beacon() {
        try {
            if (beaconSock == null) { beaconSock = new java.net.DatagramSocket(); beaconSock.setBroadcast(true); }
            Beacon.announce(beaconSock, getListeningPort());
        } catch (Exception ignored) {}
    }

    public String getCode() { return code; }
    public int getClientCount() { return clients.size(); }

    public static String newCode() { return String.valueOf(1000 + new Random().nextInt(9000)); }

    public void regenerateCode() {
        code = newCode();
        for (Client c : clients) c.deny();
        clients.clear();
        events.onClients(0);
    }

    public void setState(String json) {
        state = json;
        broadcast("{\"t\":\"state\",\"state\":" + json + "}");
    }

    public void shutdown() {
        timer.shutdownNow();
        if (beaconSock != null) beaconSock.close();
        for (Client c : clients) { try { c.close(WebSocketFrame.CloseCode.GoingAway, "fim", false); } catch (IOException ignored) {} }
        clients.clear();
        stop();
    }

    private void broadcast(String msg) {
        for (Client c : clients) c.sendSafe(msg);
    }

    private void heartbeat() {
        for (Client c : clients) {
            if (!c.alive) { clients.remove(c); try { c.close(WebSocketFrame.CloseCode.GoingAway, "sem resposta", false); } catch (IOException ignored) {} events.onClients(clients.size()); continue; }
            c.alive = false;
            try { c.ping(new byte[]{1}); } catch (IOException e) { clients.remove(c); events.onClients(clients.size()); }
        }
    }

    /* ---------- LAN address: private IPv4 on Wi-Fi/Ethernet, VPNs last ---------- */
    public static List<String> lanAddresses() {
        List<String[]> found = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName().toLowerCase(Locale.ROOT);
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    int score = 0;
                    if (a.isSiteLocalAddress()) score += 2;
                    if (name.startsWith("wlan") || name.startsWith("eth") || name.startsWith("ap")) score += 2;
                    if (name.startsWith("tun") || name.startsWith("ppp") || name.contains("vpn") || name.startsWith("rmnet")) score -= 3;
                    if (ip.startsWith("192.168.")) score += 1;
                    found.add(new String[]{ip, String.valueOf(score)});
                }
            }
        } catch (Exception ignored) {}
        found.sort((x, y) -> Integer.parseInt(y[1]) - Integer.parseInt(x[1]));
        List<String> out = new ArrayList<>();
        for (String[] f : found) out.add(f[0]);
        return out;
    }

    /* ---------- HTTP: phone page + fonts ---------- */
    @Override
    protected Response serveHttp(IHTTPSession session) {
        String uri = session.getUri();
        if (uri == null || uri.contains("..")) return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "");
        String file;
        if (uri.equals("/") || uri.equals("/index.html")) file = "remote/index.html";
        else if (uri.startsWith("/fonts/") || uri.equals("/css/fonts.css")) file = uri.substring(1);
        else file = "remote" + uri;
        try (InputStream in = assets.open(file)) {
            byte[] data = readAll(in);
            Response r = newFixedLengthResponse(Response.Status.OK, mime(file), new java.io.ByteArrayInputStream(data), data.length);
            r.addHeader("Cache-Control", "no-cache");
            return r;
        } catch (IOException e) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain; charset=utf-8", "Não encontrado");
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }

    private static String mime(String f) {
        if (f.endsWith(".html")) return "text/html; charset=utf-8";
        if (f.endsWith(".css")) return "text/css; charset=utf-8";
        if (f.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (f.endsWith(".woff2")) return "font/woff2";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    /* ---------- WebSocket ---------- */
    @Override
    protected WebSocket openWebSocket(IHTTPSession handshake) {
        return new Client(handshake);
    }

    @Override
    protected boolean isWebsocketRequested(IHTTPSession session) {
        return "/ws".equals(session.getUri()) && super.isWebsocketRequested(session);
    }

    private static boolean contains(String[] list, String v) {
        for (String s : list) if (s.equals(v)) return true;
        return false;
    }

    private class Client extends WebSocket {
        volatile boolean alive = true;
        private final boolean ok;

        Client(IHTTPSession handshake) {
            super(handshake);
            List<String> c = handshake.getParameters().get("code");
            ok = c != null && !c.isEmpty() && code.equals(c.get(0));
        }

        void sendSafe(String msg) {
            try { send(msg); } catch (IOException e) { clients.remove(this); }
        }

        void deny() {
            sendSafe("{\"t\":\"denied\"}");
            try { close(WebSocketFrame.CloseCode.PolicyViolation, "codigo", false); } catch (IOException ignored) {}
        }

        @Override
        protected void onOpen() {
            if (!ok) { deny(); return; }
            clients.add(this);
            sendSafe("{\"t\":\"hello\"}");
            String s = state;
            if (s != null) sendSafe("{\"t\":\"state\",\"state\":" + s + "}");
            events.onClients(clients.size());
        }

        @Override
        protected void onClose(WebSocketFrame.CloseCode code, String reason, boolean initiatedByRemote) {
            if (clients.remove(this)) events.onClients(clients.size());
        }

        @Override
        protected void onMessage(WebSocketFrame frame) {
            if (!ok) return;
            try {
                JSONObject m = new JSONObject(frame.getTextPayload());
                String t = m.optString("t");
                if ("action".equals(t) && contains(ACTIONS, m.optString("name"))) events.onAction(m.optString("name"));
                else if ("config".equals(t) && contains(CONFIG_KEYS, m.optString("key")) && m.has("v")) events.onConfig(m.optString("key"), m.get("v"));
                else if ("ping".equals(t)) sendSafe("{\"t\":\"pong\"}");
            } catch (Exception ignored) {}
        }

        @Override
        protected void onPong(WebSocketFrame pong) { alive = true; }

        @Override
        protected void onException(IOException exception) {
            if (clients.remove(this)) events.onClients(clients.size());
        }
    }
}
