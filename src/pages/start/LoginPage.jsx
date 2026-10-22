import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin } from "../../hooks/useAuthQueries";
import { loginSchema } from "../../lib/validation";
import { getErrorMessage } from "../../lib/errorMessages";
import Button from "../../components/ui/Button";
import Field, { TextInput } from "../../components/ui/Field";
import Notice from "../../components/ui/Notice";
import Panel from "../../components/ui/Panel";
import styles from "./StartForm.module.css";

// Sign in → back into the game where the player left off.
export default function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });

  function onSubmit(values) {
    login.mutate(values, {
      onSuccess: () => navigate(location.state?.from ?? "/", { replace: true }),
    });
  }

  return (
    <Panel>
      <h2 className={styles.heading}>Welcome back</h2>
      <p className={styles.sub}>Sign in to continue your campus life.</p>

      <form
        className={styles.form}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {login.error && (
          <Notice tone="danger">{getErrorMessage(login.error)}</Notice>
        )}

        <Field
          label="Email or username"
          htmlFor="identifier"
          error={errors.identifier?.message}
        >
          <TextInput
            id="identifier"
            autoComplete="username"
            invalid={Boolean(errors.identifier)}
            {...register("identifier")}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          loading={login.isPending}
          className={styles.submit}
        >
          Play
        </Button>
      </form>

      <p className={styles.switch}>
        New here? <Link to="/register">Create a player</Link>
      </p>
    </Panel>
  );
}
