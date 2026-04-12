import { z } from 'zod'

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be 20 characters or less')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscores'),
})

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const onboardingSchema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(20, 'Max 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  avatar_emoji: z.string().min(1, 'Pick an avatar'),
  display_name: z.string().max(40, 'Max 40 characters').optional(),
})

export const editProfileSchema = z.object({
  display_name: z.string().max(40).optional(),
  bio: z.string().max(160, 'Bio max 160 characters').optional(),
  avatar_emoji: z.string().optional(),
  favorite_fighter: z.string().max(50).optional(),
})

export const createCrewSchema = z.object({
  name: z
    .string()
    .min(3, 'Crew name must be at least 3 characters')
    .max(40, 'Max 40 characters'),
  description: z.string().max(200, 'Max 200 characters').optional(),
})

export type SignUpInput     = z.infer<typeof signUpSchema>
export type SignInInput     = z.infer<typeof signInSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
export type EditProfileInput = z.infer<typeof editProfileSchema>
export type CreateCrewInput = z.infer<typeof createCrewSchema>
