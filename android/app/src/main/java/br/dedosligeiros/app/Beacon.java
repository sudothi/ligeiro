package br.dedosligeiros.app;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Lets the professor's app find a game on the same Wi-Fi by room code alone.
 * The game broadcasts "DEDOSLIGEIROS 1 <port>" every second on UDP 8786 (no code inside);
 * the professor app collects the senders and tries the code on each one.
 * Same format as electron/server.js.
 */
public final class Beacon {
    public static final int PORT = 8786;
    private static final String TAG = "DEDOSLIGEIROS 1 ";

    private Beacon() {}

    /** Sends one announcement to every broadcast address of the active interfaces. */
    public static void announce(DatagramSocket sock, int gamePort) {
        byte[] msg = (TAG + gamePort).getBytes(StandardCharsets.US_ASCII);
        Set<InetAddress> targets = new LinkedHashSet<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) targets.add(ia.getBroadcast());
                }
            }
            targets.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {}
        for (InetAddress t : targets) {
            try { sock.send(new DatagramPacket(msg, msg.length, t, PORT)); } catch (Exception ignored) {}
        }
    }

    /** Listens for announcements for `ms` milliseconds; returns "ip:port" of each game heard. */
    public static List<String> listen(int ms) throws Exception {
        Set<String> found = new LinkedHashSet<>();
        try (DatagramSocket sock = new DatagramSocket(null)) {
            sock.setReuseAddress(true);
            sock.setBroadcast(true);
            sock.bind(new java.net.InetSocketAddress(PORT));
            long end = System.currentTimeMillis() + ms;
            byte[] buf = new byte[256];
            while (true) {
                long left = end - System.currentTimeMillis();
                if (left <= 0) break;
                sock.setSoTimeout((int) left);
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try { sock.receive(p); } catch (SocketTimeoutException e) { break; }
                String s = new String(p.getData(), 0, p.getLength(), StandardCharsets.US_ASCII).trim();
                if (!s.startsWith(TAG)) continue;
                try {
                    int port = Integer.parseInt(s.substring(TAG.length()).trim());
                    found.add(p.getAddress().getHostAddress() + ":" + port);
                } catch (NumberFormatException ignored) {}
            }
        }
        return new ArrayList<>(found);
    }
}
