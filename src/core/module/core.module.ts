/* eslint-disable no-underscore-dangle */
/* eslint-disable class-methods-use-this */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op } from 'sequelize';
import { ICoreDto, IGetPaginationDto, IGetSearchQueryDto, IGetSortQueryDto } from './core.interface';

enum QUERY_PREFIX {
  FILTER = 'f_',
}

abstract class RESTFulService {
  protected abstract params: {
    searchFields: string[];
    sortFields: string[];
    filterFields: string[];
    dateScope: string[];
    embed: string[];
  };

  // USING SEQUELIZE QUERY
  protected getParams(dto: ICoreDto) {
    const { search, sort, page: _page, limit: _limit, offset: _offset, ...restDto } = dto;

    const queryParams: Record<string | symbol, any> = {
      where: {},
      order: [],
      offset: 0,
    };

    const { limit, offset } = this.getPagination({
      limit: _limit,
      offset: _offset,
      page: _page,
    });
    if (limit) {
      queryParams.limit = limit;
      queryParams.offset = offset;
    }

    if (search) {
      queryParams.where = { ...queryParams.where, [Op.and]: this.getSearchQuery({ search }) };
    }

    if (sort && sort.length) {
      queryParams.order = this.getSortQuery({ sort });
    }

    if (Object.keys(restDto).length) {
      queryParams.where = { ...queryParams.where, ...this.getFilterQuery({ ...restDto }) };
    }

    return queryParams;
  }

  private getPagination(dto: IGetPaginationDto) {
    const { limit = '25', offset = '0', page = '1' } = dto;

    const _limit = limit === '-1' ? null : parseInt(limit, 10);
    if (_limit == null) {
      return { limit: null, page: null, offset: 0 };
    }

    const _page = parseInt(page, 10);
    const _offset = offset ? parseInt(offset, 10) : (_page - 1) * _limit;

    return { limit: _limit, offset: _offset, page: _page };
  }

  private getSearchQuery({ search }: IGetSearchQueryDto) {
    const { searchFields } = this.params;

    const searchQuery = searchFields.reduce((query, field) => {
      const sequelizeKey = this.formatKeyForSequelize(field);
      query.push({
        [sequelizeKey]: {
          [Op.iLike]: `%${search}%`,
        },
      });
      return query;
    }, [] as Record<string | symbol, any>[]);

    return searchQuery;
  }

  /**
   * A function to get the sort query from the given ICoreDto.
   * Note: Use `-` to split the sort field and provide the order
   *
   * @param {ICoreDto} dto - the ICoreDto object
   * @return {string[][] | null} the sort query or null if sort is not provided
   */
  private getSortQuery({ sort }: IGetSortQueryDto) {
    const { sortFields } = this.params;

    const arrSort = sort.split('&');

    const sortQuery = arrSort.reduce((query, item) => {
      const [key] = item.split('-');
      const value = item.startsWith('-') ? 'DESC' : 'ASC';

      if (sortFields.includes(key)) {
        const sKey = this.formatKeyForSequelize(key);
        query.push([sKey, value]);
      }
      return query;
    }, [] as string[][]);

    return sortQuery;
  }

  private getFilterQuery(dto: Record<string, string>) {
    const { filterFields } = this.params;
    const filterQuery: Record<string | symbol, any> = {};

    // please keep this order keys of symbolsConfig
    const symbolsConfig = {
      and: '%',
      or: '|',
      gte: '>=',
      lte: '<=',
      gt: '>',
      lt: '<',
      ne: '!=',
    };
    const sOp: Record<keyof typeof symbolsConfig, symbol> = {
      gt: Op.gt,
      gte: Op.gte,
      lt: Op.lt,
      lte: Op.lte,
      and: Op.and,
      or: Op.or,
      ne: Op.ne,
    };

    Object.entries(dto).forEach(([rawKey, rawValue]) => {
      // key must start with 'f_'
      if (!rawKey.startsWith(QUERY_PREFIX.FILTER) || !filterFields.includes(rawKey.substring(2))) return;
      const key = rawKey.substring(2);
      const sequelizeKey = this.formatKeyForSequelize(key);

      // check logic for and/or
      // eg: f_user.first_name = 'join|michael'
      // eg: f_user.permission = 'read&write'
      if (rawValue.includes(symbolsConfig.and) || rawValue.includes(symbolsConfig.or)) {
        const [sequelizeOp, symbol] = rawValue.includes(symbolsConfig.and)
          ? [Op.and, symbolsConfig.and]
          : [Op.or, symbolsConfig.or];

        filterQuery[sequelizeOp] = filterQuery[sequelizeOp] || [];
        filterQuery[sequelizeOp].push(...rawValue.split(symbol).map((v) => ({ [sequelizeKey]: this.formatValue(v) })));
      } else {
        // check logic for gt, gte, lt, lte
        // eg: f_user.balance = '>1000'
        // eg: f_user.balance = '<=200'
        const [opKey, opValue] = Object.values(symbolsConfig).find((symbol) => rawValue.includes(symbol)) || [];

        if (opKey && opValue) {
          const value = rawValue.split(opValue)[1]; // get the value after the symbol
          filterQuery[sequelizeKey] = { [sOp[opKey as keyof typeof sOp]]: this.formatValue(value) };
        } else {
          // default logic
          filterQuery[sequelizeKey] = this.formatValue(rawValue);
        }
      }
    });

    return filterQuery;
  }

  private formatValue(value: any) {
    return this.isNumeric(value) ? Number(value) : value;
  }

  private isNumeric(value: any) {
    if (typeof value !== 'string') return false;
    return !Number.isNaN(value) && !Number.isNaN(parseFloat(value));
  }

  private formatKeyForSequelize(key: string) {
    if (key.includes('.')) {
      return `$${key}$`;
    }
    return key;
  }
}

export default RESTFulService;
