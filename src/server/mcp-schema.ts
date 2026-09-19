import { z } from "zod";

function wireType(schema: z.ZodType): z.ZodType {
	if (schema instanceof z.ZodDate)
		return z.iso.datetime().describe("ISO 8601 date-time");
	if (schema instanceof z.ZodOptional)
		return wireType(schema.unwrap() as z.ZodType).optional();
	if (schema instanceof z.ZodNullable)
		return wireType(schema.unwrap() as z.ZodType).nullable();
	if (schema instanceof z.ZodArray)
		return z.array(wireType(schema.element as z.ZodType));
	if (schema instanceof z.ZodObject)
		return z.object(
			Object.fromEntries(
				Object.entries(schema.shape).map(([key, value]) => [
					key,
					wireType(value as z.ZodType),
				]),
			),
		);
	return schema;
}

export function mcpWireShape(schema: z.ZodType): z.ZodRawShape {
	const wire = wireType(schema);
	return wire instanceof z.ZodObject ? wire.shape : {};
}
