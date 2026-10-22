import { LuArrowDown, LuArrowUp } from "react-icons/lu";
import styles from "./Formats.module.css";

// value = { order: [itemId, …] } — starts in the shuffled order the server sent
export default function OrderingView({ view, value, onChange, disabled }) {
  const order = value?.order ?? view.items.map((i) => i.id);
  const text = new Map(view.items.map((i) => [i.id, i.text]));

  function move(index, delta) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ order: next });
  }

  return (
    <div className={styles.stack}>
      <p className={styles.instructions}>{view.instructions}</p>
      <ol className={styles.orderList}>
        {order.map((id, i) => (
          <li key={id} className={styles.orderItem}>
            <span className={styles.orderNumber}>{i + 1}</span>
            <span className={styles.orderText}>{text.get(id)}</span>
            <span className={styles.orderButtons}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => move(i, -1)}
                disabled={disabled || i === 0}
                aria-label={`Move "${text.get(id)}" up`}
              >
                <LuArrowUp aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => move(i, 1)}
                disabled={disabled || i === order.length - 1}
                aria-label={`Move "${text.get(id)}" down`}
              >
                <LuArrowDown aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
