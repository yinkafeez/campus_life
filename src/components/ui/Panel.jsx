import styles from "./Panel.module.css";

// Frosted game-UI card that floats over the 3D scene.
export default function Panel({
  as: Tag = "section",
  className = "",
  children,
  ...rest
}) {
  return (
    <Tag className={`${styles.panel} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
