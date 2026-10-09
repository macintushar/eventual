import { z } from "zod";
import { idSchema } from "./index";

export const archiveGroupSchema = z.object({ groupId: idSchema });
export const unarchiveGroupSchema = z.object({ groupId: idSchema });
export const duplicateGroupSchema = z.object({ groupId: idSchema });
export const crossGroupBalancesSchema = z.object({}).optional();
export const paymentIntentsSchema = z.object({ groupId: idSchema });

export type ArchiveGroupInput = z.infer<typeof archiveGroupSchema>;
export type DuplicateGroupInput = z.infer<typeof duplicateGroupSchema>;
export type PaymentIntentsInput = z.infer<typeof paymentIntentsSchema>;
