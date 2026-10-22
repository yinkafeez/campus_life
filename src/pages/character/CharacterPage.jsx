import { useMyCharacter, useWardrobe } from "../../hooks/useCharacterQueries";
import PageLoader from "../../components/ui/PageLoader";
import ErrorState from "../../components/ui/ErrorState";
import CharacterStudio from "./CharacterStudio";

// /character — load the wardrobe + character, then hand them to the studio.
export default function CharacterPage() {
  const wardrobe = useWardrobe();
  const character = useMyCharacter();

  if (wardrobe.isPending || character.isPending)
    return <PageLoader label="Opening your wardrobe…" />;
  const error = wardrobe.error ?? character.error;
  if (error)
    return (
      <ErrorState
        error={error}
        title="Couldn't open your wardrobe"
        onRetry={() => {
          wardrobe.refetch?.();
          character.refetch();
        }}
      />
    );

  // key: a freshly created character restarts the studio from the saved look
  return (
    <CharacterStudio
      key={character.data?._id ?? "new"}
      catalogue={wardrobe.catalogue}
      character={character.data}
    />
  );
}
