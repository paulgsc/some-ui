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
import java.security.GeneralSecurityException;
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
 * every backup and device-to-device transfer.
 *
 * A record that can never be read again reads as `lost`, and it and its key
 * are deleted, so the next pairing starts with a fresh key: the record is
 * not one, its key did not survive (a restore that slipped past those
 * rules, a Keystore reset), or the key no longer opens it. Only `decrypt`
 * says which, by throwing `Lost`, and only for those. A Keystore that
 * cannot be loaded, or that fails an operation it may pass next time
 * (`ProviderException`), rejects and keeps both: deleting them then would
 * unpair the phone for a passing fault.
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
    private static final int GCM_IV_BYTES = 12;

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
        } catch (Lost lost) {
            prefs.edit().remove(RECORD).commit();
            forgetKey();
            result.put("record", null);
            result.put("lost", true);
        } catch (Exception failed) {
            call.reject("the pairing could not be read", failed);
            return;
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
        String sealed;
        try {
            sealed = encrypt(record);
        } catch (Exception broken) {
            // The record is replaced either way, so the old key is worth
            // nothing: a key that cannot seal (reset under it, say) is
            // dropped and the write tried once more with a new one.
            try {
                forgetKey();
                sealed = encrypt(record);
            } catch (Exception failed) {
                call.reject("the pairing could not be encrypted", failed);
                return;
            }
        }
        if (!prefs().edit().putString(RECORD, sealed).commit()) {
            call.reject("the pairing could not be saved");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (!prefs().edit().remove(RECORD).commit()) {
            call.reject("the pairing could not be forgotten");
            return;
        }
        call.resolve();
    }

    // commit(), not apply(), throughout (Lint's ApplySharedPref): unpairing
    // and a dropped unreadable record must be gone from disk before the page
    // is told they are (LA8), not some time after.
    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Best effort: a key left behind is replaced by the next write anyway. */
    private static void forgetKey() {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Nothing sealed with it can be read; write() retries without it.
        }
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

    /** A record that can never be read again: see the class comment. */
    private static final class Lost extends Exception {
        Lost(String why, Throwable cause) {
            super(why, cause);
        }
    }

    /** `iv:ciphertext`, each Base64; the Keystore picks the IV. */
    private static String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
    }

    /**
     * In three steps, so a failure says whether it can pass. Loading the
     * Keystore can (it propagates); the record's shape, the key's entry and
     * the cipher's verdict cannot (`Lost`).
     */
    private static String decrypt(String stored) throws Exception {
        int split = stored.indexOf(':');
        byte[] iv;
        byte[] sealed;
        try {
            if (split < 0) throw new IllegalArgumentException("no separator");
            iv = Base64.decode(stored.substring(0, split), Base64.NO_WRAP);
            sealed = Base64.decode(stored.substring(split + 1), Base64.NO_WRAP);
        } catch (IllegalArgumentException malformed) {
            throw new Lost("not a sealed record", malformed);
        }
        if (iv.length != GCM_IV_BYTES) throw new Lost("not a sealed record", null);

        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);

        SecretKey key;
        try {
            if (!keyStore.containsAlias(KEY_ALIAS)) throw new Lost("the key did not survive", null);
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            if (!(entry instanceof KeyStore.SecretKeyEntry)) throw new Lost("the key did not survive", null);
            key = ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        } catch (GeneralSecurityException unrecoverable) {
            throw new Lost("the key did not survive", unrecoverable);
        }

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        try {
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException refused) {
            // A key the Keystore invalidated, or a record it does not open:
            // KeyPermanentlyInvalidatedException, InvalidKeyException,
            // AEADBadTagException, IllegalBlockSizeException.
            throw new Lost("the key no longer opens the record", refused);
        }
    }
}
