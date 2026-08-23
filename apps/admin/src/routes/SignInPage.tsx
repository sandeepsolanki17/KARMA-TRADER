import { SignIn } from '@clerk/clerk-react';

export function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="font-display text-2xl font-semibold tracking-tight">KARMA</div>
        <div className="eyebrow mt-1">Trading Signals · Admin Console</div>
      </div>
      <div className="glass-strong p-2">
        <SignIn
          routing="path"
          path="/sign-in"
          appearance={{
            variables: {
              colorPrimary: '#5B9DFF',
              colorBackground: 'transparent',
              colorText: '#E7E9EA',
              colorTextSecondary: '#8A9199',
              borderRadius: '0.75rem',
            },
            elements: {
              card: 'bg-transparent shadow-none',
              headerTitle: 'font-display',
            },
          }}
        />
      </div>
    </div>
  );
}
