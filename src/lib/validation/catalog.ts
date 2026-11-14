// Validación de servicios y filtros del catálogo (RF-01, RF-10, RF-11, RNF-01).
import { z } from 'zod';

// El precio se escribe en dólares con hasta 2 decimales y se guarda en centavos.
const priceUsd = z.coerce
  .number({ invalid_type_error: 'El precio debe ser un número' })
  .positive('El precio debe ser mayor que 0')
  .max(100000, 'El precio no puede superar USD 100.000')
  .refine((n) => Math.round(n * 100) / 100 === n, 'El precio admite máximo 2 decimales');

const serviceSchema = z.object({
  title: z.string({ required_error: 'El título es obligatorio' }).trim().min(5, 'El título debe tener al menos 5 caracteres').max(120, 'Máximo 120 caracteres'),
  categoryId: z.string({ required_error: 'Elige una categoría' }).min(1, 'Elige una categoría'),
  description: z.string({ required_error: 'La descripción es obligatoria' }).trim().min(20, 'La descripción debe tener al menos 20 caracteres').max(2000, 'Máximo 2000 caracteres'),
  price: priceUsd,
  deliveryDays: z.coerce.number({ invalid_type_error: 'El plazo debe ser un número' }).int('El plazo debe ser un número entero de días').min(1, 'El plazo mínimo es 1 día').max(365, 'El plazo máximo es 365 días'),
  status: z.enum(['BORRADOR', 'PUBLICADO', 'PAUSADO']).default('BORRADOR'),
});

const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    min: z.coerce.number().min(0).optional(),
    max: z.coerce.number().min(0).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(9),
  })
  .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, { path: ['max'], message: 'El precio máximo debe ser mayor o igual al mínimo' });

const deleteServiceSchema = z.object({ confirm: z.literal(true, { errorMap: () => ({ message: 'Debes confirmar la eliminación' }) }) });

export { serviceSchema, catalogQuerySchema, deleteServiceSchema };
