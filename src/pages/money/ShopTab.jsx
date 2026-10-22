import { useState } from "react";
import Button from "../../components/ui/Button";
import { newRequestKey } from "../../api/economyApi";
import { useBuyItem, useShop } from "../../hooks/useEconomyQueries";
import { toast } from "../../stores/useToastStore";
import styles from "./Money.module.css";
import ErrorState from "../../components/ui/ErrorState";

const KINDS = [
  ["food", "Food & drinks"],
  ["stationery", "Study items"],
  ["tools", "Tools for hustles"],
  ["stock", "Hustle stock"],
  ["clothing", "Clothing"],
  ["accessories", "Accessories"],
];

export default function ShopTab({ wallet }) {
  const shop = useShop();
  const buy = useBuyItem();
  const [quantities, setQuantities] = useState({});
  if (shop.isPending) return <p className={styles.muted}>Loading the shop…</p>;
  if (shop.error)
    return <ErrorState error={shop.error} onRetry={shop.refetch} />;

  function purchase(item) {
    const quantity = quantities[item.key] ?? 1;
    buy.mutate(
      { itemKey: item.key, quantity, requestKey: newRequestKey() },
      {
        onSuccess: () =>
          toast({
            title: "Bought",
            text: `${quantity} × ${item.name}`,
            tone: "success",
          }),
      },
    );
  }

  return (
    <>
      {buy.error && <ErrorState error={buy.error} onRetry={buy.refetch} />}
      {KINDS.map(([kind, label]) => {
        const items = shop.data.filter((i) => i.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} className={styles.card}>
            <h2 className={styles.cardTitle}>{label}</h2>
            <ul className={styles.list}>
              {items.map((item) => {
                const quantity = quantities[item.key] ?? 1;
                const cost = item.price * quantity;
                const ownedWear = item.wardrobe && item.owned > 0;
                return (
                  <li key={item.key} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{item.name}</span>
                      <span className={styles.muted}>
                        {item.description}
                        {item.effects?.energy &&
                          ` · +${item.effects.energy} energy`}
                        {item.owned > 0 && ` · you have ${item.owned}`}
                      </span>
                    </span>
                    {!item.wardrobe && item.maxPerPurchase > 1 && (
                      <select
                        className={styles.select}
                        value={quantity}
                        aria-label={`How many ${item.name}`}
                        onChange={(e) =>
                          setQuantities((q) => ({
                            ...q,
                            [item.key]: Number(e.target.value),
                          }))
                        }
                      >
                        {Array.from(
                          { length: Math.min(item.maxPerPurchase, 10) },
                          (_, i) => i + 1,
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className={styles.price}>
                      {cost} {wallet.currency.symbol}
                    </span>
                    <Button
                      size="sm"
                      disabled={ownedWear || cost > wallet.balance}
                      loading={
                        buy.isPending && buy.variables?.itemKey === item.key
                      }
                      onClick={() => purchase(item)}
                      aria-label={`Buy ${item.name}`}
                    >
                      {ownedWear ? "Owned" : "Buy"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
