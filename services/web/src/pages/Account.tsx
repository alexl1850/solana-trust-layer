import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { requestNonce, verifySignature, getAccount } from "../api.js";

interface AccountInfo {
  wallet_address: string;
  tier: string;
  token_balance: number;
  balance_checked_at: string | null;
}

export function Account() {
  const { publicKey, signMessage } = useWallet();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    setSigningIn(true);
    setError(null);
    try {
      const wallet = publicKey.toBase58();
      const { message } = await requestNonce(wallet);
      const signatureBytes = await signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(signatureBytes);
      const { token } = await verifySignature(wallet, signature);
      localStorage.setItem("stl_jwt", token);
      const info = await getAccount();
      setAccount(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage]);

  useEffect(() => {
    if (localStorage.getItem("stl_jwt")) {
      getAccount()
        .then(setAccount)
        .catch(() => localStorage.removeItem("stl_jwt"));
    }
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Account</h1>
      <div className="card">
        <WalletMultiButton />

        {publicKey && !account && (
          <div style={{ marginTop: 16 }}>
            <button onClick={signIn} disabled={signingIn}>
              {signingIn ? "Signing in..." : "Sign in with wallet"}
            </button>
          </div>
        )}

        {error && (
          <p className="error-text" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {account && (
          <div style={{ marginTop: 20 }}>
            <div className="muted">Wallet</div>
            <div style={{ marginBottom: 12 }}>{account.wallet_address}</div>

            <div className="muted">Tier</div>
            <div style={{ marginBottom: 12, textTransform: "uppercase" }}>{account.tier}</div>

            <div className="muted">Token balance</div>
            <div>{account.token_balance.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
