import { z } from "zod";

// Client-side checks for instant feedback. They mirror the server's rules;
// the server validates again and always has the final word.

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  email: z.email("Enter a valid email").trim(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,24}$/, "3–24 characters: a-z, 0-9, _ and ."),
  displayName: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(40, "At most 40 characters"),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .refine(
      (val) => new TextEncoder().encode(val).length <= 72,
      "At most 72 bytes",
    )
    .refine(
      (val) => /[A-Za-z]/.test(val) && /\d/.test(val),
      "Use a letter and a number",
    ),
  confirmAge: z.literal(true, { error: "Please confirm you are 16 or older" }),
});

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(40, "At most 40 characters"),
  gender: z.enum(["", "male", "female"]),
  bio: z.string().trim().max(280, "At most 280 characters"),
});
