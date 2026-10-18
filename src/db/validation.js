import * as z from "zod"; 
 
export const Player = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.number().int().min(18).max(65),
  email: z.email()
});