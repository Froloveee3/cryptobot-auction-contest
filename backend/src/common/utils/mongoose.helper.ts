import { Types } from 'mongoose';


export function toObjectIdString(id: Types.ObjectId | string): string {
  if (typeof id === 'string') {
    return id;
  }
  return id.toString();
}


export function toPlainObject<
  T extends { _id: Types.ObjectId; toObject?: () => Record<string, unknown> },
>(doc: T | null): (Omit<T, '_id' | 'toObject'> & { _id: string }) | null {
  if (!doc) {
    return null;
  }
  const plain = (doc as { toObject?: () => Record<string, unknown> }).toObject
    ? (doc as { toObject: () => Record<string, unknown> }).toObject()
    : (doc as Record<string, unknown>);
  return {
    ...plain,
    _id: toObjectIdString(plain._id as Types.ObjectId | string),
  } as Omit<T, '_id' | 'toObject'> & { _id: string };
}


export function toPlainObjectArray<
  T extends { _id: Types.ObjectId; toObject?: () => Record<string, unknown> },
>(docs: T[]): Array<Omit<T, '_id' | 'toObject'> & { _id: string }> {
  return docs.map((doc) => {
    const plain = (doc as { toObject?: () => Record<string, unknown> }).toObject
      ? (doc as { toObject: () => Record<string, unknown> }).toObject()
      : (doc as Record<string, unknown>);
    return {
      ...plain,
      _id: toObjectIdString(plain._id as Types.ObjectId | string),
    } as Omit<T, '_id' | 'toObject'> & { _id: string };
  });
}
