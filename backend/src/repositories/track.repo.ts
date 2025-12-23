// src/repositories/track.repo.ts
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

/** Strict “by id + select” — this one is already fine */
export async function getTrackById<Select extends Prisma.trackSelect>(
    id: string,
    select: Select
): Promise<Prisma.trackGetPayload<{ select: Select }> | null> {
    return prisma.track.findUnique({ where: { id }, select });
}

/** Flexible: where + select (unique or not) */
export async function getOneTrack<Select extends Prisma.trackSelect>(
    where: Prisma.trackWhereUniqueInput | Prisma.trackWhereInput,
    select: Select
): Promise<Prisma.trackGetPayload<{ select: Select }> | null> {
    if ('id' in (where as any)) {
        return prisma.track.findUnique({
            where: where as Prisma.trackWhereUniqueInput,
            select,
        }) as any;
    }
    return prisma.track.findFirst({
        where: where as Prisma.trackWhereInput,
        select,
    }) as any;
}

/**
 * Pragmatic helper: pass a list of fields, get a plain object with those fields.
 * Keeps types simple; TS checks field names. Return is Record<string, any> to avoid
 * gnarly conditional typing from Prisma’s generated types.
 */
export async function getTrackFieldsByIdLoose(
    id: string,
    fields: (keyof Prisma.trackSelect)[]
): Promise<Record<string, any> | null> {
    const select = Object.fromEntries(fields.map((f) => [f, true])) as Prisma.trackSelect;
    return prisma.track.findUnique({
        where: { id },
        select: select as any,
    }) as any;
}
