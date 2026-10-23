import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRegister } from "../../hooks/useAuthQueries";
import { registerSchema } from "../../lib/validation";
import { getErrorMessage, getFieldErrors } from "../../lib/errorMessages";
import Button from "../../components/ui/Button";
import Field, { TextInput } from "../../components/ui/Field";
import Notice from "../../components/ui/Notice";
import Panel from "../../components/ui/Panel";
import styles from "./StartForm.module.css";

const FIELDS = [
  {
    name: "displayName",
    label: "Display name",
    autoComplete: "nickname",
    hint: "What other players see.",
  },
  { name: "username", label: "Username", autoComplete: "username" },
  {
    name: "email",
    label: "Email",
    type: "email",
    autoComplete: "email",
    hint: "Private — never shown to other players.",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
    hint: "10+ characters with a letter and a number.",
  },
];

// Create a player account → straight into simulated admission.
export default function RegisterPage({ onSuccess, onSwitch, bare = false }) {
  const signUp = useRegister();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { confirmAge: false },
  });

  // show the server's field errors (e.g. "Already registered") on the right input
  useEffect(() => {
    const fieldErrors = getFieldErrors(signUp.error);
    Object.entries(fieldErrors).forEach(([name, message]) =>
      setError(name, { message }),
    );
    signUp.error?.details
      ?.filter(() => signUp.error.code === "ACCOUNT_EXISTS")
      .forEach((el) => setError(el.path, { message: "Already registered" }));
  }, [signUp.error, setError]);

  function onSubmit(values) {
    signUp.mutate(values, {
      // first time here: see the whole campus before applying
      onSuccess: () =>
        onSuccess ? onSuccess() : navigate("/welcome", { replace: true }),
    });
  }

  const Wrapper = bare ? "div" : Panel;
  return (
    <Wrapper>
      <h2 className={styles.heading}>Create your player</h2>
      <p className={styles.sub}>
        Then apply to your (simulated) dream university.
      </p>

      <form
        className={styles.form}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {signUp.error && signUp.error.code !== "VALIDATION_ERROR" && (
          <Notice tone="danger">{getErrorMessage(signUp.error)}</Notice>
        )}

        {FIELDS.map(({ name, label, hint, ...input }) => (
          <Field
            key={name}
            label={label}
            htmlFor={name}
            hint={hint}
            error={errors[name]?.message}
          >
            <TextInput
              id={name}
              invalid={Boolean(errors[name])}
              {...input}
              {...register(name)}
            />
          </Field>
        ))}

        <label className={styles.check}>
          <input type="checkbox" {...register("confirmAge")} />
          <span>
            I am 16 or older and accept the{" "}
            <Link to="/privacy">game rules & privacy notice</Link>.
          </span>
        </label>
        {errors.confirmAge && (
          <p className={styles.checkError} role="alert">
            {errors.confirmAge.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          loading={signUp.isPending}
          className={styles.submit}
        >
          Create player
        </Button>
      </form>

      <p className={styles.switch}>
        Already playing?{" "}
        {onSwitch ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={onSwitch}
          >
            Sign in
          </button>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </p>
    </Wrapper>
  );
}
