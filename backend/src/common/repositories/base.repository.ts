import { Model, ClientSession, Types } from 'mongoose';
import { toPlainObject } from '../utils/mongoose.helper';


function convertLeanDoc<T extends { _id: string }>(doc: any): T {
  if (!doc) return doc;
  const id = doc._id;
  const idStr = id?.toString ? id.toString() : (typeof id === 'string' ? id : String(id));
  return {
    ...doc,
    _id: idStr,
  } as T;
}


export interface IBaseRepository<T> {
  findById(id: string, session?: ClientSession): Promise<T | null>;
  findByIds(ids: string[], session?: ClientSession): Promise<T[]>;
  findOne(filter: Record<string, any>, session?: ClientSession): Promise<T | null>;
  findMany(filter: Record<string, any>, session?: ClientSession): Promise<T[]>;
  create(data: Partial<T>, session?: ClientSession): Promise<T>;
  updateById(id: string, update: Partial<T>, session?: ClientSession): Promise<T | null>;
  deleteById(id: string, session?: ClientSession): Promise<boolean>;
  exists(filter: Record<string, any>, session?: ClientSession): Promise<boolean>;
}


export abstract class BaseRepository<T extends { _id: string }> implements IBaseRepository<T> {
  constructor(protected readonly model: Model<any>) {}

  
  getModel(): Model<any> {
    return this.model;
  }

  
  protected toDomain(doc: any): T | null {
    if (!doc) return null;
    return convertLeanDoc<T>(doc);
  }

  
  protected toDomainArray(docs: any[]): T[] {
    return docs.map((doc) => convertLeanDoc<T>(doc));
  }

  async findById(id: string, session?: ClientSession): Promise<T | null> {
    const query = this.model.findById(id);
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return doc ? convertLeanDoc<T>(doc) : null;
  }

  async findByIds(ids: string[], session?: ClientSession): Promise<T[]> {
    const query = this.model.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } });
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return docs.map((doc) => convertLeanDoc<T>(doc));
  }

  async findOne(filter: Record<string, any>, session?: ClientSession): Promise<T | null> {
    const query = this.model.findOne(filter);
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return doc ? convertLeanDoc<T>(doc) : null;
  }

  async findMany(filter: Record<string, any>, session?: ClientSession): Promise<T[]> {
    const query = this.model.find(filter);
    if (session) {
      query.session(session);
    }
    const docs = await query.lean().exec();
    return docs.map((doc) => convertLeanDoc<T>(doc));
  }

  async create(data: Partial<T>, session?: ClientSession): Promise<T> {
    const docs = session
      ? await this.model.create([data], { session })
      : await this.model.create([data]);
    return toPlainObject(docs[0]) as T;
  }

  async updateById(id: string, update: Partial<T>, session?: ClientSession): Promise<T | null> {
    const query = this.model.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (session) {
      query.session(session);
    }
    const doc = await query.lean().exec();
    return doc ? convertLeanDoc<T>(doc) : null;
  }

  async deleteById(id: string, session?: ClientSession): Promise<boolean> {
    const query = this.model.findByIdAndDelete(id);
    if (session) {
      query.session(session);
    }
    const result = await query.exec();
    return !!result;
  }

  async exists(filter: Record<string, any>, session?: ClientSession): Promise<boolean> {
    const query = this.model.exists(filter);
    if (session) {
      query.session(session);
    }
    const result = await query.exec();
    return !!result;
  }
}
