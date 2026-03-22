import { z } from "zod";

export const errorDetailSchema = z.object({
	field: z.string(),
	message: z.string(),
});

export const errorResponseSchema = z.object({
	error: z.object({
		code: z.enum(["BAD_REQUEST", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"]),
		message: z.string(),
		details: z.array(errorDetailSchema).optional(),
	}),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorCode = ErrorResponse["error"]["code"];
