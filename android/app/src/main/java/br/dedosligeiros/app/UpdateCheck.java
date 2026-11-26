package br.dedosligeiros.app;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/** Update logic with no Android dependencies (so it can be tested on a PC).
 *  Same feed and signature format as electron/updater.js. */
public final class UpdateCheck {
    private UpdateCheck() {}

    public interface Progress { void on(double fraction); }

    /** The Android part of a verified, newer update.json, or null. */
    public static final class Found {
        public String version, notes, url, sha256;
        public long size;
        public int versionCode;
    }

    public static Found check(JSONObject edition, int currentCode) throws Exception {
        String feed = edition.optString("feed", "");
        if (feed.isEmpty()) return null;
        if (!feed.endsWith("/")) feed += "/";
        String text = getText(feed + "update.json");
        String key = edition.isNull("publicKey") ? "" : edition.optString("publicKey", "");
        if (!key.isEmpty()) {
            String sig = getText(feed + "update.json.sig");
            if (!verify(text, sig, key)) throw new SecurityException("assinatura inválida");
        }
        JSONObject m = new JSONObject(text);
        JSONObject a = m.optJSONObject("android");
        if (a == null) return null;
        int code = a.optInt("versionCode", 0);
        String sha = a.optString("sha256", "");
        if (code <= currentCode || !sha.matches("[0-9a-fA-F]{64}") || a.optString("url", "").isEmpty()) return null;
        Found f = new Found();
        f.version = m.optString("version", "");
        f.notes = m.optString("notes", "");
        f.url = new URL(new URL(feed), a.getString("url")).toString();
        f.sha256 = sha.toLowerCase();
        f.size = a.optLong("size", 0);
        f.versionCode = code;
        return f;
    }

    /** ECDSA P-256 / SHA-256; signature is base64 of raw r||s (64 bytes), key is base64 SPKI. */
    public static boolean verify(String text, String sigB64, String keyB64) {
        try {
            byte[] raw = b64(sigB64);
            if (raw.length != 64) return false;
            PublicKey pk = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(b64(keyB64)));
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(pk);
            s.update(text.getBytes(StandardCharsets.UTF_8));
            return s.verify(toDer(raw));
        } catch (Exception e) { return false; }
    }

    /** Plain base64 decoder (java.util.Base64 needs Android 8; the app runs from Android 5.1). */
    static byte[] b64(String s) {
        String abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        int buf = 0, bits = 0;
        for (char ch : s.toCharArray()) {
            if (ch == '=') break;
            int v = abc.indexOf(ch);
            if (v < 0) { if (Character.isWhitespace(ch)) continue; throw new IllegalArgumentException("base64"); }
            buf = (buf << 6) | v; bits += 6;
            if (bits >= 8) { bits -= 8; o.write((buf >> bits) & 0xff); }
        }
        return o.toByteArray();
    }

    private static byte[] toDer(byte[] raw) {
        byte[] r = derInt(raw, 0), s = derInt(raw, 32);
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(0x30); o.write(r.length + s.length);
        o.write(r, 0, r.length); o.write(s, 0, s.length);
        return o.toByteArray();
    }

    private static byte[] derInt(byte[] raw, int off) {
        int i = off, end = off + 32;
        while (i < end - 1 && raw[i] == 0) i++;
        boolean pad = (raw[i] & 0x80) != 0;
        int len = end - i + (pad ? 1 : 0);
        byte[] out = new byte[len + 2];
        out[0] = 0x02; out[1] = (byte) len;
        System.arraycopy(raw, i, out, 2 + (pad ? 1 : 0), end - i);
        return out;
    }

    public static String getText(String url) throws Exception {
        HttpURLConnection c = open(url, 8000);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 256 * 1024) throw new Exception("resposta grande demais"); }
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        } finally { c.disconnect(); }
    }

    /** Downloads to dest (reusing an earlier complete download) and checks the SHA-256. */
    public static void download(Found f, File dest, Progress p) throws Exception {
        if (dest.exists() && sha256(dest).equals(f.sha256)) { p.on(1); return; }
        File tmp = new File(dest.getPath() + ".part");
        HttpURLConnection c = open(f.url, 15000);
        long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : f.size;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[65536]; int n; long got = 0, last = 0;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n); md.update(buf, 0, n); got += n;
                long now = System.currentTimeMillis();
                if (total > 0 && now - last > 150) { last = now; p.on((double) got / total); }
            }
        } finally { c.disconnect(); }
        if (!hex(md.digest()).equals(f.sha256)) { tmp.delete(); throw new SecurityException("arquivo baixado não confere"); }
        dest.delete();
        if (!tmp.renameTo(dest)) throw new Exception("não salvou o arquivo");
        p.on(1);
    }

    private static HttpURLConnection open(String url, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeout); c.setReadTimeout(timeout * 2);
        c.setUseCaches(false); c.setInstanceFollowRedirects(true);
        int code = c.getResponseCode();
        if (code != 200) { c.disconnect(); throw new Exception("HTTP " + code); }
        return c;
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (FileInputStream in = new FileInputStream(f)) { byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) md.update(b, 0, n); }
        return hex(md.digest());
    }

    private static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }
}
