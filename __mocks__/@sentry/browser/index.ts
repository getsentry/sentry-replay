const startTransaction = jest.fn(() => ({
  finish: jest.fn(() => 'transaction_id'),
}));
const getCurrentHub = jest.fn(() => ({
  startTransaction,
}));
export { getCurrentHub };
