import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCurrentUser, useUpdatePlayer } from "../../hooks/useAuthQueries";
import { profileSchema } from "../../lib/validation";
import { getErrorMessage } from "../../lib/errorMessages";
import Button from "../../components/ui/Button";
import Field, { SelectInput, TextInput } from "../../components/ui/Field";
import Notice from "../../components/ui/Notice";
import Panel from "../../components/ui/Panel";
import styles from "./ProfilePage.module.css";

// Edit the in-game profile. Account details (email) stay private and aren't editable here.
export default function ProfilePage() {
  const { data: session } = useCurrentUser();
  const update = useUpdatePlayer();
  const { player, user } = session;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: player.displayName,
      gender: player.gender ?? "",
      bio: player.bio ?? "",
    },
  });

  function onSubmit({ gender, ...values }) {
    update.mutate(
      { ...values, ...(gender && { gender }) },
      {
        onSuccess: ({ player: saved }) =>
          reset({ ...saved, gender: saved.gender ?? "", bio: saved.bio ?? "" }),
      },
    );
  }

  return (
    <Panel className={styles.panel}>
      <h1 className={styles.heading}>Player profile</h1>
      <p className={styles.sub}>
        Signed in as <strong>@{user.username}</strong>. Only your display name
        is shown to other players.
      </p>

      <form
        className={styles.form}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {update.error && (
          <Notice tone="danger">{getErrorMessage(update.error)}</Notice>
        )}
        {update.isSuccess && !isDirty && (
          <Notice tone="success">Profile saved.</Notice>
        )}

        <Field
          label="Display name"
          htmlFor="displayName"
          error={errors.displayName?.message}
        >
          <TextInput
            id="displayName"
            invalid={Boolean(errors.displayName)}
            {...register("displayName")}
          />
        </Field>

        <Field
          label="Character gender"
          htmlFor="gender"
          hint="Used in-game, e.g. for hostel allocation. Your character, not your real identity."
        >
          <SelectInput id="gender" {...register("gender")}>
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </SelectInput>
        </Field>

        <Field label="Bio" htmlFor="bio" error={errors.bio?.message}>
          <textarea
            id="bio"
            rows={3}
            className={styles.textarea}
            {...register("bio")}
          />
        </Field>

        <Button type="submit" loading={update.isPending} disabled={!isDirty}>
          Save profile
        </Button>
      </form>
    </Panel>
  );
}
