package com.transages.mobilebridge;
import android.app.Activity;
import android.os.Bundle;
import android.Manifest;
import android.content.pm.PackageManager;
public final class PermissionsActivity extends Activity {
    public void onCreate(Bundle state) {
        super.onCreate(state);
        if (checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS}, 1);
        else finish();
    }
    public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) { super.onRequestPermissionsResult(request,permissions,grants); finish(); }
}
