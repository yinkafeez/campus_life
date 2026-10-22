import { useSearchParams } from "react-router-dom";
import { LuZap } from "react-icons/lu";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import SimulatedBanner from "../../components/SimulatedBanner";
import { useWallet } from "../../hooks/useEconomyQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import WalletTab from "./WalletTab";
import ShopTab from "./ShopTab";
import InventoryTab from "./InventoryTab";
import HustlesTab from "./HustlesTab";
import styles from "./Money.module.css";

const TABS = [
  ["wallet", "Wallet"],
  ["shop", "Shop"],
  ["inventory", "My items"],
  ["hustles", "Hustles"],
];

// /money — fictional Campus Coins: wallet & budget, shop, items, and campus hustles.
export default function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab"))
    ? params.get("tab")
    : "wallet";
  const wallet = useWallet();

  if (wallet.isPending) return <PageLoader label="Opening your wallet…" />;
  if (wallet.error)
    return (
      <div className={styles.page}>
        <Notice tone="danger">{getErrorMessage(wallet.error)}</Notice>
      </div>
    );
  const w = wallet.data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{w.currency.name}</p>
          <h1 className={styles.balance}>
            {w.balance.toLocaleString("en-NG")}{" "}
            <span className={styles.symbol}>{w.currency.symbol}</span>
          </h1>
        </div>
        <div
          className={styles.energy}
          aria-label={`Energy ${w.energy} of ${w.maxEnergy}`}
        >
          <LuZap aria-hidden="true" />
          <span className={styles.meter}>
            <span style={{ width: `${(w.energy / w.maxEnergy) * 100}%` }} />
          </span>
          <span>
            {w.energy}/{w.maxEnergy}
          </span>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Money">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? styles.tabOn : styles.tab}
            onClick={() => setParams({ tab: key })}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "wallet" && <WalletTab wallet={w} />}
      {tab === "shop" && <ShopTab wallet={w} />}
      {tab === "inventory" && <InventoryTab />}
      {tab === "hustles" && <HustlesTab />}

      <SimulatedBanner text="Campus Coins are a fictional game currency. They can't be bought with real money or cashed out, and nothing in the game is a bet." />
    </div>
  );
}
