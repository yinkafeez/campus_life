import { useState } from "react";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import {
  useAddCampaignItem,
  useNominate,
  useWithdraw,
} from "../../hooks/useElectionQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { CAMPAIGN_KINDS } from "./electionText";
import styles from "./Elections.module.css";

const POSTER_COLORS = [
  "#1f7a4d",
  "#1d4ed8",
  "#b91c1c",
  "#7c3aed",
  "#c2410c",
  "#0f766e",
];
const LAYOUTS = [
  ["bold", "Bold"],
  ["classic", "Classic"],
  ["minimal", "Minimal"],
];
const lines = (text) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

/** Stand for the position: slogan, manifesto and a poster style. */
export function NominationForm({ electionId }) {
  const nominate = useNominate();
  const [slogan, setSlogan] = useState("");
  const [summary, setSummary] = useState("");
  const [points, setPoints] = useState("");
  const [color, setColor] = useState(POSTER_COLORS[0]);
  const [layout, setLayout] = useState("bold");

  function submit(e) {
    e.preventDefault();
    nominate.mutate(
      {
        id: electionId,
        slogan: slogan.trim() || undefined,
        manifesto: {
          summary: summary.trim() || undefined,
          points: lines(points),
        },
        poster: { color, layout },
      },
      {
        onSuccess: () =>
          toast({
            text: "You're on the ballot. Start campaigning!",
            tone: "success",
          }),
      },
    );
  }

  return (
    <section className={styles.card} aria-labelledby="stand">
      <h2 id="stand" className={styles.cardTitle}>
        Stand for this position
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor="slogan">
          Slogan <span className={styles.meta}>(optional, 80 characters)</span>
        </label>
        <input
          id="slogan"
          className={styles.input}
          value={slogan}
          maxLength={80}
          onChange={(e) => setSlogan(e.target.value)}
        />
        <label className={styles.label} htmlFor="summary">
          Manifesto summary
        </label>
        <textarea
          id="summary"
          className={styles.textarea}
          rows={3}
          maxLength={600}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <label className={styles.label} htmlFor="points">
          Promises <span className={styles.meta}>(one per line, up to 8)</span>
        </label>
        <textarea
          id="points"
          className={styles.textarea}
          rows={4}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
        <fieldset className={styles.inline}>
          <legend className={styles.label}>Poster</legend>
          {POSTER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={color === c ? styles.swatchOn : styles.swatch}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
          <select
            className={styles.select}
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            aria-label="Poster layout"
          >
            {LAYOUTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </fieldset>
        {nominate.error && (
          <Notice tone="danger">{getErrorMessage(nominate.error)}</Notice>
        )}
        <Button type="submit" loading={nominate.isPending}>
          Submit my nomination
        </Button>
        <p className={styles.fine}>
          Keep it respectful: no insults, threats or real people. Public text is
          filtered and can be reported.
        </p>
      </form>
    </section>
  );
}

/** A candidate's tools: posters, speeches, events, debate answers, withdraw. */
export function CampaignDesk({ electionId, rules, mine }) {
  const add = useAddCampaignItem();
  const withdraw = useWithdraw();
  const questions = rules.debateQuestions ?? [];
  const [kind, setKind] = useState("speech");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [question, setQuestion] = useState(0);
  const [location, setLocation] = useState("");
  const [sure, setSure] = useState(false);

  function submit(e) {
    e.preventDefault();
    add.mutate(
      {
        id: electionId,
        kind,
        body: body.trim(),
        ...(kind !== "debate-answer" &&
          title.trim() && { title: title.trim() }),
        ...(kind === "debate-answer" && { question: Number(question) }),
        ...(kind === "event" &&
          location.trim() && { location: location.trim() }),
      },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          toast({ text: `${CAMPAIGN_KINDS[kind]} posted.`, tone: "success" });
        },
      },
    );
  }

  return (
    <section className={styles.card} aria-labelledby="desk">
      <h2 id="desk" className={styles.cardTitle}>
        Your campaign
      </h2>
      {mine && (
        <p className={styles.meta}>
          {mine.buzz.activities} posts · {mine.buzz.endorsements} endorsements ·{" "}
          {mine.buzz.volunteers} volunteers. Limits: {rules.maxPosters ?? 3}{" "}
          posters, {rules.maxSpeeches ?? 3} speeches, {rules.maxEvents ?? 3}{" "}
          events.
        </p>
      )}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor="kind">
          Post a
        </label>
        <select
          id="kind"
          className={styles.select}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {Object.entries(CAMPAIGN_KINDS)
            .filter(([k]) => k !== "debate-answer" || questions.length)
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </select>
        {kind === "debate-answer" ? (
          <>
            <label className={styles.label} htmlFor="question">
              Debate question
            </label>
            <select
              id="question"
              className={styles.select}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            >
              {questions.map((q, i) => (
                <option key={q} value={i}>
                  {q}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label className={styles.label} htmlFor="item-title">
              Title
            </label>
            <input
              id="item-title"
              className={styles.input}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </>
        )}
        {kind === "event" && (
          <>
            <label className={styles.label} htmlFor="item-place">
              Where
            </label>
            <input
              id="item-place"
              className={styles.input}
              value={location}
              maxLength={80}
              placeholder="e.g. Faculty quadrangle"
              onChange={(e) => setLocation(e.target.value)}
            />
          </>
        )}
        <label className={styles.label} htmlFor="item-body">
          {kind === "debate-answer" ? "Your answer" : "Text"}
        </label>
        <textarea
          id="item-body"
          className={styles.textarea}
          rows={4}
          maxLength={1500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        {add.error && (
          <Notice tone="danger">{getErrorMessage(add.error)}</Notice>
        )}
        <Button type="submit" loading={add.isPending} disabled={!body.trim()}>
          Post
        </Button>
      </form>
      <div className={styles.inline}>
        {sure ? (
          <>
            <span>Withdraw from this election? You can't undo this.</span>
            <Button
              variant="secondary"
              size="sm"
              loading={withdraw.isPending}
              onClick={() => withdraw.mutate(electionId)}
            >
              Yes, withdraw
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSure(false)}>
              Keep running
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setSure(true)}>
            Withdraw candidacy
          </Button>
        )}
      </div>
      {withdraw.error && (
        <Notice tone="danger">{getErrorMessage(withdraw.error)}</Notice>
      )}
    </section>
  );
}
