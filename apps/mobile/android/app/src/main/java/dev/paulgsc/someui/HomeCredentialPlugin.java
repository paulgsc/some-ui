package dev.paulgsc.someui;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.KeyStore;
import java.security.UnrecoverableEntryException;
import java.security.UnrecoverableKeyException;
import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
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
 * rules, a Keystore reset), or the key no longer opens it. `decrypt` says
 * which, by throwing `Lost`. The Keystore folds its own faults into the same
 * exception types, so a failure `mayPass` names (Android 13+ says which are
 * transient or a system error), or loading the Keystore at all, rejects and
 * keeps both: deleting them then would unpair the phone for a passing fault.
 * Before Android 13 the Keystore cannot tell them apart, and such a fault
 * reads as `lost`, which the page says.
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
            // A key that cannot seal (reset under it, say) is dropped and the
            // write tried once more with a new one. A fault that may pass
            // keeps it: a record still stored may yet open with it.
            if (mayPass(broken)) {
                call.reject("the pairing could not be encrypted", broken);
                return;
            }
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

    /** A record that can never be read again: see the class comment. */
    private static final class Lost extends Exception {

        Lost(String why, Throwable cause) {
            super(why, cause);
        }
    }

    /** Android 13+ marks a Keystore fault that may pass; see the class comment. */
    private static boolean mayPass(Throwable error) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false;
        for (Throwable at = error; at != null; at = at.getCause()) {
            if (at instanceof android.security.KeyStoreException) {
                android.security.KeyStoreException keystore = (android.security.KeyStoreException) at;
                return keystore.isTransientFailure() || keystore.isSystemError();
            }
        }
        return false;
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        return keyStore;
    }

    /** Best effort: a key left behind is replaced by the next write anyway. */
    private static void forgetKey() {
        try {
            keyStore().deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // write() makes a new one once this one cannot seal.
        }
    }

    /** The stored key, or `null` when there is none. */
    private static SecretKey storedKey(KeyStore keyStore) throws Exception {
        if (!keyStore.containsAlias(KEY_ALIAS)) return null;
        KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
        if (!(entry instanceof KeyStore.SecretKeyEntry)) {
            throw new UnrecoverableKeyException("not a secret key entry");
        }
        return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
    }

    private static SecretKey key() throws Exception {
        SecretKey stored = storedKey(keyStore());
        if (stored != null) return stored;
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

        KeyStore keyStore = keyStore();
        SecretKey key;
        try {
            key = storedKey(keyStore);
        } catch (UnrecoverableEntryException unrecoverable) {
            if (mayPass(unrecoverable)) throw unrecoverable;
            throw new Lost("the key did not survive", unrecoverable);
        }
        if (key == null) throw new Lost("the key did not survive", null);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        try {
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (
            InvalidKeyException
            | InvalidAlgorithmParameterException
            | BadPaddingException
            | IllegalBlockSizeException refused
        ) {
            // KeyPermanentlyInvalidatedException is an InvalidKeyException,
            // AEADBadTagException a BadPaddingException.
            if (mayPass(refused)) throw refused;
            throw new Lost("the key no longer opens the record", refused);
        }
    }
}
