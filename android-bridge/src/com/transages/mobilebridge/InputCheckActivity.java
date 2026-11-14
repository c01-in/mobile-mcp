package com.transages.mobilebridge;
import android.app.Activity;
import android.os.Bundle;
import android.widget.EditText;
import android.view.WindowManager;
// Explicit ADB-only diagnostic, no launcher entry, no persistence.
public final class InputCheckActivity extends Activity {
    static EditText field;
    public void onCreate(Bundle state) {
        super.onCreate(state);
        field = new EditText(this); field.setHint("MCP input verification");
        setContentView(field); field.requestFocus();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    }
    public void onDestroy() { field = null; super.onDestroy(); }
}
