import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import {
  useConsumeItem,
  useGiftItem,
  useInventory,
} from "../../hooks/useEconomyQueries";
import { useFriends } from "../../hooks/useSocialQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import styles from "./Money.module.css";
import ErrorState from "../../components/ui/ErrorState";

export default function InventoryTab() {
  const inventory = useInventory();
  const consume = useConsumeItem();
  const error = consume.error;
  if (inventory.isPending) return <p className={styles.muted}>Loading…</p>;
  if (inventory.error)
    return <ErrorState error={inventory.error} onRetry={inventory.refetch} />;

  const items = inventory.data.filter((i) => !i.wardrobe);
  const clothes = inventory.data.filter((i) => i.wardrobe);
  return (
    <>
      {error && <Notice tone="danger">{getErrorMessage(error)}</Notice>}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Items</h2>
        {items.length === 0 && (
          <p className={styles.muted}>
            Nothing yet — visit the shop for food, study items and tools.
          </p>
        )}
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.itemKey} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {item.name} × {item.quantity}
                </span>
                <span className={styles.muted}>
                  {item.kind}
                  {item.effects?.energy && ` · +${item.effects.energy} energy`}
                </span>
              </span>
              {item.usable && (
                <Button
                  size="sm"
                  loading={
                    consume.isPending && consume.variables === item.itemKey
                  }
                  onClick={() =>
                    consume.mutate(item.itemKey, {
                      onSuccess: (data) =>
                        toast({
                          text: `${data.used} — energy now ${data.energy}`,
                          tone: "success",
                        }),
                    })
                  }
                >
                  Eat / use
                </Button>
              )}
              {item.transferable && <GiftButton item={item} />}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Clothes</h2>
        <p className={styles.muted}>
          {clothes.length} items in your wardrobe.{" "}
          <Link to="/character">Open the wardrobe</Link> to wear them.
        </p>
      </section>
    </>
  );
}

function GiftButton({ item }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const friends = useFriends();
  const gift = useGiftItem();
  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Gift
      </Button>
    );
  }
  return (
    <form
      className={styles.inline}
      onSubmit={(e) => {
        e.preventDefault();
        gift.mutate(
          { itemKey: item.itemKey, quantity: 1, toPlayerId: to },
          {
            onSuccess: ({ gift: g }) => {
              toast({
                text: `Gave ${item.name} to ${g.to.displayName}`,
                tone: "success",
              });
              setOpen(false);
            },
          },
        );
      }}
    >
      <select
        className={styles.select}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-label="Friend"
        required
      >
        <option value="">Choose a friend</option>
        {(friends.data?.friends ?? []).map((f) => (
          <option key={f.playerId} value={f.playerId}>
            {f.displayName}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={!to} loading={gift.isPending}>
        Send
      </Button>
      {gift.error && (
        <span className={styles.warn}>{getErrorMessage(gift.error)}</span>
      )}
    </form>
  );
}
