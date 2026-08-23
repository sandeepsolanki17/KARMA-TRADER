import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { colors, radius } from '../src/lib/theme';
import { GlassPanel } from '../src/components/GlassPanel';

// Required once, at module scope, for Clerk's OAuth browser redirect to
// resolve correctly back into the app (Expo's documented pattern).
WebBrowser.maybeCompleteAuthSession();

/** Warms up the Android in-app browser ahead of the OAuth flow — Expo/Clerk's documented UX improvement. */
function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

type Stage = 'enterEmail' | 'enterCode';

/**
 * Client authentication is Email OTP or "Continue with Google" ONLY — no
 * password flow, per product requirement (SMS OTP explicitly excluded for
 * cost reasons). This mirrors Clerk's own documented email_code strategy
 * and OAuth SSO flow; nothing here is custom auth/OTP infrastructure.
 */
export default function SignInScreen() {
  useWarmUpBrowser();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('enterEmail');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSendCode = async () => {
    if (!isLoaded || !email) return;
    setSubmitting(true);
    try {
      await signIn.create({ identifier: email });
      const emailFactor = signIn.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
      if (!emailFactor || !('emailAddressId' in emailFactor)) {
        Alert.alert('No account found', 'No client account exists for this email yet — ask your admin to invite you.');
        return;
      }
      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: emailFactor.emailAddressId });
      setStage('enterCode');
    } catch (err: any) {
      Alert.alert('Could not send code', err?.errors?.[0]?.longMessage ?? 'Check the email address and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!isLoaded || !code) return;
    setSubmitting(true);
    try {
      const attempt = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        router.replace('/');
      } else {
        Alert.alert('Verification incomplete', 'Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Invalid code', err?.errors?.[0]?.longMessage ?? 'That code was incorrect or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = useCallback(async () => {
    setSubmitting(true);
    try {
      const { createdSessionId, setActive: setActiveSSO } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: Linking.createURL('/', { scheme: 'karma' }),
      });
      if (createdSessionId && setActiveSSO) {
        await setActiveSSO({ session: createdSessionId });
        router.replace('/');
      }
      // A null createdSessionId means the user cancelled the flow — no error to show.
    } catch (err: any) {
      Alert.alert('Google sign-in failed', err?.errors?.[0]?.longMessage ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [startSSOFlow, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>KARMA</Text>
      <Text style={styles.tagline}>TRADING SIGNALS</Text>

      <GlassPanel style={styles.form}>
        {stage === 'enterEmail' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={submitting || !email}>
              {submitting ? <ActivityIndicator color={colors.void} /> : <Text style={styles.buttonText}>Send code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.hint}>Enter the 6-digit code sent to {email}</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <TouchableOpacity style={styles.button} onPress={handleVerifyCode} disabled={submitting || code.length < 6}>
              {submitting ? <ActivityIndicator color={colors.void} /> : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStage('enterEmail')}>
              <Text style={styles.linkText}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={submitting}>
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>
      </GlassPanel>

      <Text style={styles.footerHint}>New clients are invited by their admin — sign in with the email they used.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  logo: { color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: 1 },
  tagline: { color: colors.muted, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 24 },
  form: { width: '100%', maxWidth: 360, gap: 12 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.amber,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: colors.void, fontWeight: '600', fontSize: 15 },
  hint: { color: colors.muted, fontSize: 13, marginBottom: 2 },
  linkText: { color: colors.amber, fontSize: 13, textAlign: 'center', marginTop: 6 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  dividerText: { color: colors.muted, fontSize: 11, fontFamily: 'monospace' },
  googleButton: {
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  googleButtonText: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  footerHint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 20, maxWidth: 320 },
});
