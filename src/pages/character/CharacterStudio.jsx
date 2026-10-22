import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuArrowLeft, LuUndo2 } from "react-icons/lu";
import {
  useCreateCharacter,
  useUpdateLook,
} from "../../hooks/useCharacterQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { cleanSlots, defaultLook } from "../../game/character/look";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import BodyTab from "./BodyTab";
import ClothesTab from "./ClothesTab";
import OutfitsTab from "./OutfitsTab";
import styles from "./CharacterStudio.module.css";

const CharacterPreview = lazy(() => import("../../game/CharacterPreview"));

const TABS = [
  { key: "body", label: "Body & hair" },
  { key: "clothes", label: "Clothes" },
  { key: "outfits", label: "Outfits" },
];

// The character creator / wardrobe: live 3D preview + editing panel.
export default function CharacterStudio({ catalogue, character }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // the fresher journey sends players here and back (?next=/admission); same-site paths only
  const next = /^\/(?!\/)/.test(params.get("next") ?? "")
    ? params.get("next")
    : null;
  const goOn = () => navigate(next ?? "/play");
  const [tab, setTab] = useState("body");
  const [draft, setDraft] = useState(() =>
    character
      ? {
          appearance: character.appearance,
          equipped: cleanSlots(character.equipped),
        }
      : defaultLook(catalogue),
  );
  const create = useCreateCharacter();
  const update = useUpdateLook();
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const look = {
    appearance: draft.appearance,
    equipped: cleanSlots(draft.equipped),
  };
  const saved =
    character &&
    JSON.stringify({
      appearance: character.appearance,
      equipped: cleanSlots(character.equipped),
    }) === JSON.stringify(look);

  const undo = () =>
    setDraft({
      appearance: character.appearance,
      equipped: cleanSlots(character.equipped),
    });

  function save(then) {
    const mutation = character ? update : create;
    mutation.mutate(look, { onSuccess: then });
  }

  return (
    <div className={styles.studio}>
      <header className={styles.bar}>
        <Link to={next ?? "/"} className={styles.back} aria-label="Back">
          <LuArrowLeft aria-hidden="true" />
        </Link>
        <h1 className={styles.title}>
          {character ? "Wardrobe" : "Create your character"}
          {character && !saved && (
            <span className={styles.unsaved}>Unsaved changes</span>
          )}
        </h1>
        <div className={styles.actions}>
          {character && !saved && (
            <Button variant="ghost" size="sm" onClick={undo} disabled={saving}>
              <LuUndo2 aria-hidden="true" /> Undo
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={saving}
            disabled={saved}
            onClick={() => save()}
          >
            {saved ? "Saved" : "Save"}
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => (saved ? goOn() : save(goOn))}
          >
            {next
              ? saved
                ? "Continue"
                : "Save & continue"
              : saved
                ? "Enter campus"
                : "Save & play"}
          </Button>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.preview} aria-label="Character preview">
          <Suspense fallback={<PageLoader label="Loading 3D preview…" />}>
            <CharacterPreview
              appearance={draft.appearance}
              equipped={draft.equipped}
              catalogue={catalogue}
            />
          </Suspense>
          <p className={styles.hint}>Drag to turn · scroll to zoom</p>
        </section>

        <section className={styles.panel}>
          <div className={styles.tabs} role="tablist" aria-label="Customise">
            {TABS.map((el) => (
              <button
                key={el.key}
                type="button"
                role="tab"
                aria-selected={tab === el.key}
                className={tab === el.key ? styles.tabOn : styles.tab}
                onClick={() => setTab(el.key)}
              >
                {el.label}
              </button>
            ))}
          </div>

          {error && <Notice tone="danger">{getErrorMessage(error)}</Notice>}

          <div className={styles.tabBody} role="tabpanel">
            {tab === "body" && (
              <BodyTab
                appearance={draft.appearance}
                catalogue={catalogue}
                onChange={(appearance) =>
                  setDraft((d) => ({ ...d, appearance }))
                }
              />
            )}
            {tab === "clothes" && (
              <ClothesTab
                equipped={draft.equipped}
                catalogue={catalogue}
                onChange={(equipped) => setDraft((d) => ({ ...d, equipped }))}
              />
            )}
            {tab === "outfits" && (
              <OutfitsTab
                character={character}
                catalogue={catalogue}
                currentSlots={look.equipped}
                onWear={(updated) =>
                  setDraft({
                    appearance: updated.appearance,
                    equipped: cleanSlots(updated.equipped),
                  })
                }
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
