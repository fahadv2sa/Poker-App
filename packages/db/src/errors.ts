/** Domain errors for the wallet/auth layer. All messages are Arabic-facing safe. */

export class WalletError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class WalletNotFoundError extends WalletError {
  constructor(userId: string) {
    super(`لا توجد محفظة للمستخدم ${userId}`, "WALLET_NOT_FOUND");
  }
}

export class InsufficientFundsError extends WalletError {
  constructor(
    public readonly available: bigint,
    public readonly requested: bigint,
  ) {
    super("الرصيد غير كافٍ", "INSUFFICIENT_FUNDS");
  }
}

export class UsernameTakenError extends WalletError {
  constructor() {
    super("اسم المستخدم مستخدم بالفعل", "USERNAME_TAKEN");
  }
}
