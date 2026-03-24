export type MovementType = 'income' | 'expense' | 'transfer';
export type AccountType = 'Efectivo' | 'Banco' | 'Digital' | 'Ahorro' | 'Inversión';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  plan?: 'basic' | 'premium';
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  color: string;
  userId: string;
}

export interface Category {
  id: string;
  name: string;
  limit?: number;
  userId: string;
}

export interface Movement {
  id: string;
  type: MovementType;
  amount: number;
  categoryId: string;
  accountOriginId: string;
  accountDestinationId?: string;
  date: string;
  note?: string;
  userId: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  priority?: 'baja' | 'media' | 'alta';
  category?: string;
  userId: string;
}

export interface WeeklyBudget {
  id: string;
  income: number;
  expenses: { name: string; amount: number }[];
  userId: string;
}

export interface DashboardStats {
  totalBalance: number;
  dailyIncome: number;
  dailyExpense: number;
  topCategory: string;
  weeklyIncome: number;
  weeklyExpense: number;
  monthlyIncome: number;
  monthlyExpense: number;
}
