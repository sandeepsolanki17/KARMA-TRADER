import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useSignIn, useSignUp, useSSO } from '@clerk/clerk-expo';
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
 * Combined sign-in / sign-up flow for KARMA clients.
 *
 * Strategy: Email OTP or "Continue with Google" only.
 * When a client enters their email:
 *  1. Try signIn.create() first — if they already have a Clerk account, this works.
 *  2. If Clerk says "user not found" (identifier_not_found), automatically
 *     fall through to signUp.create() — this creates their Clerk account.
 *  3. Either way, send an email_code and verify it.
 *  4. After verification, router.replace('/') → the API's on-demand
 *     provisioning links their new Clerk ID to the pending client invite.
 *
 * This means: Admin invites → Client downloads APK → Client types email →
 * Gets OTP → Enters OTP → Immediately inside the app. No waiting for
 * invitation emails, no "user not found" errors.
 */
export default function SignInScreen() {
  useWarmUpBrowser();
  const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('enterEmail');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Track whether we fell through to signUp so handleVerifyCode knows which to call
  const [usingSignUp, setUsingSignUp] = useState(false);

  const isLoaded = signInLoaded && signUpLoaded;

  /**
   * Sends the OTP code. Tries signIn first, falls back to signUp if the
   * user doesn't have a Clerk account yet.
   */
  const handleSendCode = async () => {
    if (!isLoaded || !email.trim()) return;
    setSubmitting(true);
    setUsingSignUp(false);
    try {
      // --- Attempt 1: signIn (existing Clerk user) ---
      await signIn!.create({ identifier: email.trim() });
      const emailFactor = signIn!.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
      if (emailFactor && 'emailAddressId' in emailFactor) {
        await signIn!.prepareFirstFactor({ strategy: 'email_code', emailAddressId: emailFactor.emailAddressId });
        setStage('enterCode');
        return;
      }
      // If no email_code factor available, fall through to signUp
      throw { errors: [{ code: 'form_identifier_not_found' }] };
    } catch (signInErr: any) {
      const errCode = signInErr?.errors?.[0]?.code;
      // "form_identifier_not_found" or "identifier_not_found" means no Clerk account yet — expected for new clients
      if (errCode === 'form_identifier_not_found' || errCode === 'identifier_not_found') {
        try {
          // --- Attempt 2: signUp (create new Clerk account) ---
          await signUp!.create({ emailAddress: email.trim() });
          await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
          setUsingSignUp(true);
          setStage('enterCode');
        } catch (signUpErr: any) {
          // If signUp also fails (e.g., email already exists but signIn failed for another reason)
          // Try one more signIn attempt
          const signUpErrCode = signUpErr?.errors?.[0]?.code;
          if (signUpErrCode === 'form_email_address_exists') {
            // Email exists in Clerk but signIn failed — could be OAuth-only account
            Alert.alert(
              'Account exists',
              'This email is already registered. Try "Continue with Google" instead, or check your email spelling.',
            );
          } else {
            Alert.alert('Could not send code', signUpErr?.errors?.[0]?.longMessage ?? 'Please check the email and try again.');
          }
        }
      } else {
        Alert.alert('Could not send code', signInErr?.errors?.[0]?.longMessage ?? 'Check the email address and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Verifies the OTP code. Uses the correct Clerk method depending on
   * whether we're in signIn or signUp flow.
   */
  const handleVerifyCode = async () => {
    if (!isLoaded || !code) return;
    setSubmitting(true);
    try {
      if (usingSignUp) {
        // --- signUp verification ---
        const attempt = await signUp!.attemptEmailAddressVerification({ code });
        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setActiveSignUp!({ session: attempt.createdSessionId });
          router.replace('/');
        } else {
          Alert.alert('Verification incomplete', 'Please try again.');
        }
      } else {
        // --- signIn verification ---
        const attempt = await signIn!.attemptFirstFactor({ strategy: 'email_code', code });
        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setActiveSignIn!({ session: attempt.createdSessionId });
          router.replace('/');
        } else {
          Alert.alert('Verification incomplete', 'Please try again.');
        }
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

  const handleBack = () => {
    setStage('enterEmail');
    setCode('');
    setUsingSignUp(false);
  };

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
              editable={!submitting}
            />
            <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={submitting || !email.trim()}>
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
              editable={!submitting}
              autoFocus
            />
            <TouchableOpacity style={styles.button} onPress={handleVerifyCode} disabled={submitting || code.length < 6}>
              {submitting ? <ActivityIndicator color={colors.void} /> : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBack} disabled={submitting}>
              <Text style={styles.linkText}>← Use a different email</Text>
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

      <Text style={styles.footerHint}>Sign in with the email your admin used to invite you.</Text>
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
