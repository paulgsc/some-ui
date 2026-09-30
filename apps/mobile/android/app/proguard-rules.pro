# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Annotations Tink compiles against but does not ship. tink-android 1.8.0
# (via androidx.security:security-crypto, a dependency of
# @capacitor-community/sqlite) references them; the runtime ignores an
# annotation whose class is absent, so nothing is lost by their absence. R8
# fails the release build on any missing class, so it is told these six are
# expected - by name, not by package, so a missing class that is more than an
# annotation still fails. The list is R8's own
# (app/build/outputs/mapping/release/missing_rules.txt).
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.CheckReturnValue
-dontwarn com.google.errorprone.annotations.Immutable
-dontwarn com.google.errorprone.annotations.RestrictedApi
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.concurrent.GuardedBy
