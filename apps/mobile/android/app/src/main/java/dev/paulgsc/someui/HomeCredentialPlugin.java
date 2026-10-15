package dev.paulgsc.someui;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The phone's pairing with the home server (apps/www src/lib/home-link): the
 * session token home handed it, with the address it was paired to, as one
 * record. Encrypted with an AES key that lives in the Android Keystore and
 * cannot leave it, and stored in its own preferences file, which
 * res/xml/backup_rules.xml and res/xml/data_extraction_rules.xml keep out of
 * every backup and device-to-device transfer. A record whose key did not
 * survive (a restore that slipped past those rules, a Keystore reset) reads
 * as `lost` and is deleted, never as an error the page has to handle.
 *
 * Nothing here sends anything: www reads the record when the person taps
 * something that sends, and forgets it when they unpair.
 */
@CapacitorPlugin(name = "HomeCredential")
public class HomeCredentialPlugin extends Plugin {

    /** Named in both backup rule files: change all three together. */
    static final String PREFS = "home_credential";

    private static final String KEY_ALIAS = "home-credential";
    private static final String RECORD = "record";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;

    @PluginMethod
    public void read(PluginCall call) {
        SharedPreferences prefs = prefs();
        String stored = prefs.getString(RECORD, null);
        JSObject result = new JSObject();
        if (stored == null) {
            result.put("record", null);
            result.put("lost", false);
            call.resolve(result);
            return;
        }
        try {
            result.put("record", decrypt(stored));
            result.put("lost", false);
        } catch (Exception unreadable) {
            prefs.edit().remove(RECORD).commit();
            result.put("record", null);
            result.put("lost", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String record = call.getString("record");
        if (record == null) {
            call.reject("record is required");
            return;
        }
        try {
            if (!prefs().edit().putString(RECORD, encrypt(record)).commit()) {
                call.reject("the pairing could not be saved");
                return;
            }
            call.resolve();
        } catch (Exception failed) {
            call.reject("the pairing could not be encrypted", failed);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().remove(RECORD).commit();
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    /** `iv:ciphertext`, each Base64; the Keystore picks the IV. */
    private static String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
    }

    private static String decrypt(String stored) throws Exception {
        int split = stored.indexOf(':');
        if (split < 0) throw new IllegalArgumentException("not a sealed record");
        byte[] iv = Base64.decode(stored.substring(0, split), Base64.NO_WRAP);
        byte[] sealed = Base64.decode(stored.substring(split + 1), Base64.NO_WRAP);
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(KEY_ALIAS)) throw new IllegalStateException("the key did not survive");
        SecretKey key = ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
        return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
    }
}
