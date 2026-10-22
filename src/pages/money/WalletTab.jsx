import { useState } from "react";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import {
  useBills,
  useBudget,
  useClaimAllowance,
  useMoveSavings,
  usePayBill,
  useSetPlan,
  useTransactions,
} from "../../hooks/useEconomyQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { formatTime } from "../../lib/chatTime";
import styles from "./Money.module.css";

const KIND_LABELS = {
  grant: "Welcome money",
  allowance: "Allowance",
  purchase: "Purchase",
  refund: "Refund",
  hustle: "Hustle pay",
  bill: "Bill",
  "savings-in": "To savings",
  "savings-out": "From savings",
  prize: "Prize",
  "admin-adjust": "Correction",
};

export default function WalletTab({ wallet }) {
  const allowance = useClaimAllowance();
  const bills = useBills();
  const pay = usePayBill();
  const due = (bills.data ?? []).filter((b) => b.status === "due");

  return (
    <>
      {wallet.allowance.available && (
        <section className={styles.cardAccent}>
          <p>
            Your weekly allowance of {wallet.allowance.amount}{" "}
            {wallet.currency.symbol} is ready.
          </p>
          <Button
            size="sm"
            onClick={() => allowance.mutate()}
            loading={allowance.isPending}
          >
            Collect allowance
          </Button>
        </section>
      )}
      {allowance.error && (
        <Notice tone="danger">{getErrorMessage(allowance.error)}</Notice>
      )}

      {due.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Bills to pay</h2>
          <ul className={styles.list}>
            {due.map((b) => (
              <li key={b._id} className={styles.row}>
                <span className={styles.rowMain}>{b.label}</span>
                <span className={styles.amountOut}>−{b.amount}</span>
                <Button
                  size="sm"
                  onClick={() => pay.mutate(b._id)}
                  loading={pay.isPending && pay.variables === b._id}
                >
                  Pay
                </Button>
              </li>
            ))}
          </ul>
          {pay.error && (
            <Notice tone="danger">{getErrorMessage(pay.error)}</Notice>
          )}
        </section>
      )}

      <Budget wallet={wallet} />
      <Savings wallet={wallet} />
      <History />
    </>
  );
}

function Budget({ wallet }) {
  const budget = useBudget();
  const plan = useSetPlan();
  const [limit, setLimit] = useState("");
  const b = budget.data;
  if (!b) return null;
  const over = b.budgetLeft !== null && b.budgetLeft < 0;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>This week ({b.week})</h2>
      <div className={styles.stats}>
        <div>
          <p className={styles.muted}>Money in</p>
          <p className={styles.amountIn}>+{b.incomeThisWeek}</p>
        </div>
        <div>
          <p className={styles.muted}>Spent</p>
          <p className={styles.amountOut}>−{b.spentThisWeek}</p>
        </div>
        <div>
          <p className={styles.muted}>Budget left</p>
          <p className={over ? styles.amountOut : styles.big}>
            {b.budgetLeft === null ? "—" : b.budgetLeft}
          </p>
        </div>
      </div>
      {over && (
        <p className={styles.warn}>
          You're over your weekly budget. Cheaper food (puff-puff, sachet water)
          can stretch your coins.
        </p>
      )}
      {Object.keys(b.spendingByCategory30d).length > 0 && (
        <div>
          <p className={styles.muted}>Spending, last 30 days</p>
          <ul className={styles.bars}>
            {Object.entries(b.spendingByCategory30d).map(([cat, amount]) => (
              <li key={cat}>
                <span className={styles.barLabel}>{cat}</span>
                <span className={styles.bar}>
                  <span
                    style={{
                      width: `${Math.min(100, (amount / Math.max(1, b.spent30d)) * 100)}%`,
                    }}
                  />
                </span>
                <span>{amount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          plan.mutate({ weeklyBudget: limit === "" ? null : Number(limit) });
        }}
      >
        <label className={styles.label}>
          Weekly budget ({wallet.currency.symbol})
          <input
            className={styles.input}
            type="number"
            min={0}
            value={limit}
            placeholder={b.weeklyBudget ?? "none"}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={plan.isPending}
        >
          Set
        </Button>
      </form>
    </section>
  );
}

function Savings({ wallet }) {
  const move = useMoveSavings();
  const plan = useSetPlan();
  const [amount, setAmount] = useState("");
  const [goal, setGoal] = useState({ label: "", target: "" });
  const value = Number(amount);
  const goalPercent = wallet.savingsGoal
    ? Math.min(
        100,
        Math.round((wallet.savings / wallet.savingsGoal.target) * 100),
      )
    : null;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        Savings: {wallet.savings} {wallet.currency.symbol}
      </h2>
      {wallet.savingsGoal ? (
        <div>
          <p className={styles.muted}>
            Goal: {wallet.savingsGoal.label} ({wallet.savings}/
            {wallet.savingsGoal.target})
          </p>
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${goalPercent}%` }} />
          </span>
        </div>
      ) : (
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            plan.mutate({
              savingsGoal: { label: goal.label, target: Number(goal.target) },
            });
          }}
        >
          <input
            className={styles.input}
            value={goal.label}
            onChange={(e) => setGoal((g) => ({ ...g, label: e.target.value }))}
            placeholder="Saving for… (e.g. a laptop)"
            aria-label="Savings goal"
            minLength={2}
            required
          />
          <input
            className={styles.input}
            type="number"
            min={1}
            value={goal.target}
            onChange={(e) => setGoal((g) => ({ ...g, target: e.target.value }))}
            placeholder="Target"
            aria-label="Goal amount"
            required
          />
          <Button type="submit" size="sm" variant="secondary">
            Set goal
          </Button>
        </form>
      )}
      <div className={styles.inline}>
        <input
          className={styles.input}
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          aria-label="Savings amount"
        />
        <Button
          size="sm"
          disabled={!value}
          onClick={() =>
            move.mutate(
              { direction: "deposit", amount: value },
              { onSuccess: () => setAmount("") },
            )
          }
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!value}
          onClick={() =>
            move.mutate(
              { direction: "withdraw", amount: value },
              { onSuccess: () => setAmount("") },
            )
          }
        >
          Withdraw
        </Button>
      </div>
      {move.error && (
        <Notice tone="danger">{getErrorMessage(move.error)}</Notice>
      )}
    </section>
  );
}

function History() {
  const tx = useTransactions();
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Transactions</h2>
      {tx.data?.entries.length === 0 && (
        <p className={styles.muted}>No transactions yet.</p>
      )}
      <ul className={styles.list}>
        {tx.data?.entries.map((e) => (
          <li key={e.id} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{e.description}</span>
              <span className={styles.muted}>
                {KIND_LABELS[e.kind] ?? e.kind}
                {e.account === "savings" && " · savings"} ·{" "}
                {formatTime(e.createdAt)}
              </span>
            </span>
            <span className={e.amount > 0 ? styles.amountIn : styles.amountOut}>
              {e.amount > 0 ? `+${e.amount}` : `−${-e.amount}`}
            </span>
            <span className={styles.muted}>{e.balanceAfter}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
