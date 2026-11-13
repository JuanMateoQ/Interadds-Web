// Esquemas de validación COMPARTIDOS entre el navegador (RNF-01: validación en cliente)
// y el servidor (validación siempre en servidor). Mensajes de error claros en español.
import { z } from 'zod';

const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

const email = z
  .string({ required_error: 'El correo es obligatorio' })
  .trim()
  .toLowerCase()
  .min(1, 'El correo es obligatorio')
  .max(120, 'El correo no puede superar 120 caracteres')
  .email('Ingresa un correo válido, por ejemplo nombre@dominio.com');

const password = z
  .string({ required_error: 'La clave es obligatoria' })
  .min(8, 'La clave debe tener al menos 8 caracteres')
  .max(72, 'La clave no puede superar 72 caracteres')
  .regex(/[A-Za-z]/, 'La clave debe incluir al menos una letra')
  .regex(/[0-9]/, 'La clave debe incluir al menos un número');

const name = z
  .string({ required_error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(80, 'El nombre no puede superar 80 caracteres')
  .regex(NAME_RE, 'El nombre solo puede contener letras, espacios, punto, apóstrofo y guion');

// Solo dígitos, entre 7 y 15 (RNF-01: "solo números")
const phone = z
  .string()
  .trim()
  .regex(/^[0-9]{7,15}$/, 'El teléfono debe tener solo números (7 a 15 dígitos)');

const registerSchema = z
  .object({
    name,
    email,
    password,
    confirmPassword: z.string({ required_error: 'Confirma tu clave' }),
    // RS-41: el registro nuevo es Cliente; solo se permite elegir Proveedor. Nunca ADMIN_SISTEMA.
    role: z.enum(['CLIENTE', 'PROVEEDOR'], { errorMap: () => ({ message: 'Elige si eres Cliente o Proveedor' }) }).default('CLIENTE'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Las claves no coinciden' });

const loginSchema = z.object({
  email: z.string({ required_error: 'El correo es obligatorio' }).trim().toLowerCase().min(1, 'El correo es obligatorio').max(120),
  password: z.string({ required_error: 'La clave es obligatoria' }).min(1, 'La clave es obligatoria').max(200),
});

const forgotSchema = z.object({ email });

const resetSchema = z
  .object({
    token: z.string().min(20, 'El enlace de recuperación no es válido').max(200),
    password,
    confirmPassword: z.string({ required_error: 'Confirma tu clave' }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Las claves no coinciden' });

const profileSchema = z.object({
  name,
  phone: z.union([phone, z.literal('')]).optional(),
  provider: z
    .object({
      tradeName: z.string().trim().min(2, 'El nombre comercial debe tener al menos 2 caracteres').max(100, 'Máximo 100 caracteres'),
      description: z.string().trim().min(20, 'Describe tu actividad en al menos 20 caracteres').max(1000, 'Máximo 1000 caracteres'),
      contactEmail: z.union([z.string().trim().toLowerCase().email('Correo de contacto inválido'), z.literal('')]).optional(),
      contactPhone: z.union([phone, z.literal('')]).optional(),
    })
    .optional(),
});

/** Aplica un esquema a los valores de un formulario y devuelve { ok, data, errors } (para el navegador). */
function validateForm(schema, values) {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data, errors: {} };
  const errors: any = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, data: null, errors };
}

export { registerSchema, loginSchema, forgotSchema, resetSchema, profileSchema, validateForm, email, password, name, phone };
