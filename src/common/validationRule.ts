// http://s3.example.com https://s3.example.com s3.example.com
// export const domainRegExp = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/g;
// s3.example.com
export const domainRegExp = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/g;

// path1/path2
export const domainPathRegExp = /^[^\/](.*[^\/])?$/g;

// name=bucketview&version=1
export const domainQueryRegExp = /^[\w-]+(=[\w-]*)?(&[\w-]+(=[\w-]*)?)*$/g;

export const domainValidationRule = {
  pattern: domainRegExp,
  message: '首部不能包含协议 如 https://，且尾部不能含有 /'
};

export const domainPathValidationRule = {
  pattern: domainPathRegExp,
  message: '首尾不能含有 /'
};

export const domainQueryValidationRule = {
  pattern: domainQueryRegExp,
  message: '首部不能含有 ?'
};
