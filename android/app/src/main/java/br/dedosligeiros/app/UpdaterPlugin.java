package br.dedosligeiros.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;

/** Update before playing on Android (see js/updater-android.js and UpdateCheck.java).
 *  The edition file (public/edition.json) is copied in at build time; without it, nothing happens. */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private UpdateCheck.Found found;

    private JSONObject edition() {
        try (InputStream in = getContext().getAssets().open("public/edition.json")) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[4096]; int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            return new JSONObject(new String(bo.toByteArray(), java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) { return null; }
    }

    @SuppressWarnings("deprecation")
    private int currentCode() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return Integer.MAX_VALUE; }
    }

    @PluginMethod
    public void check(PluginCall call) {
        getBridge().execute(() -> {
            JSObject o = new JSObject();
            JSONObject ed = edition();
            if (ed == null) { call.resolve(o); return; }
            try {
                found = UpdateCheck.check(ed, currentCode());
                if (found != null) { o.put("version", found.version); o.put("notes", found.notes); o.put("edition", ed.optString("edition")); }
            } catch (Exception e) { o.put("error", e.getMessage()); }
            call.resolve(o);
        });
    }

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "atualizacao");
        dir.mkdirs();
        return new File(dir, "dedos-ligeiros-" + found.versionCode + ".apk");
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (found == null) { call.reject("nada para instalar"); return; }
        getBridge().execute(() -> {
            File apk = apkFile();
            try {
                UpdateCheck.download(found, apk, p -> { JSObject e = new JSObject(); e.put("p", p); notifyListeners("progress", e); });
            } catch (Exception e) { call.reject(e.getMessage()); return; }
            JSObject o = new JSObject();
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                // one-time: Android asks to allow this app to install updates
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(s);
                o.put("need", "permission");
                call.resolve(o);
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            o.put("need", "confirm");
            call.resolve(o);
        });
    }
}
