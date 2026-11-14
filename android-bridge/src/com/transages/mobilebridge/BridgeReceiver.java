package com.transages.mobilebridge;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.database.Cursor;
import android.net.Uri;
import android.telephony.SmsManager;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
public final class BridgeReceiver extends BroadcastReceiver {
    private static ClipData previousClip;
    private static String pendingText;
    public void onReceive(Context context, Intent intent) {
        JSONObject result = new JSONObject();
        try {
            JSONObject payload = new JSONObject(new String(Base64.decode(intent.getStringExtra("payload"), Base64.DEFAULT), StandardCharsets.UTF_8));
            String action = intent.getAction().substring("com.transages.mobilebridge.".length());
            if (action.equals("paste_prepare")) {
                ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                previousClip = clipboard.getPrimaryClip();
                pendingText = payload.getString("text");
                clipboard.setPrimaryClip(ClipData.newPlainText("MCP input",pendingText));
                result.put("ready",true);
            } else if (action.equals("paste_finish")) {
                ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData current = clipboard.getPrimaryClip();
                if (current != null && current.getItemCount()>0 && pendingText != null && pendingText.contentEquals(current.getItemAt(0).coerceToText(context))) {
                    if (previousClip != null) clipboard.setPrimaryClip(previousClip);
                    else if(android.os.Build.VERSION.SDK_INT >= 28) clipboard.clearPrimaryClip();
                    else clipboard.setPrimaryClip(ClipData.newPlainText("",""));
                }
                pendingText=null; previousClip=null;
                result.put("restored",true);
            } else if (action.equals("check_input")) {
                result.put("text", InputCheckActivity.field == null ? JSONObject.NULL : InputCheckActivity.field.getText().toString());
            } else if (action.equals("read_sms")) {
                JSONArray messages = new JSONArray();
                int limit = Math.min(100, Math.max(1, payload.optInt("limit",20)));
                try (Cursor cursor = context.getContentResolver().query(Uri.parse("content://sms"), new String[]{"_id","address","body","date","type","read"}, "date >= ?", new String[]{Long.toString(payload.optLong("since",0))}, "date DESC")) {
                    if (cursor != null) while(messages.length()<limit && cursor.moveToNext()) {
                        JSONObject row = new JSONObject();
                        for (int i=0;i<cursor.getColumnCount();i++) row.put(cursor.getColumnName(i), cursor.isNull(i) ? JSONObject.NULL : cursor.getString(i));
                        messages.put(row);
                    }
                }
                result.put("messages",messages);
            } else if (action.equals("send_sms")) {
                String recipient = payload.getString("recipient"), text = payload.getString("text");
                if (!recipient.matches("[+0-9][0-9 ()-]*") || text.isEmpty()) throw new Exception("Invalid recipient or empty message");
                SmsManager sms = SmsManager.getDefault();
                sms.sendMultipartTextMessage(recipient,null,sms.divideMessage(text),null,null);
                result.put("submitted",true); result.put("delivered",JSONObject.NULL);
            } else throw new Exception("Unknown bridge action");
            setResultCode(0);
        } catch (Exception e) {
            try { result.put("error", e.toString()); } catch(Exception ignored) {}
            setResultCode(1);
        }
        setResultData(Base64.encodeToString(result.toString().getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));
    }
}
