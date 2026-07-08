import { API_URL, authHeaders, authJsonHeaders, parseJsonOrThrow } from './api';

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategoryInput {
  name: string;
}

export async function listExpenseCategories(
  accessToken: string,
): Promise<ExpenseCategory[]> {
  const response = await fetch(`${API_URL}/expense-categories`, {
    headers: authHeaders(accessToken),
  });
  return parseJsonOrThrow(response);
}

export async function createExpenseCategory(
  accessToken: string,
  input: ExpenseCategoryInput,
): Promise<ExpenseCategory> {
  const response = await fetch(`${API_URL}/expense-categories`, {
    method: 'POST',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function updateExpenseCategory(
  accessToken: string,
  id: string,
  input: Partial<ExpenseCategoryInput>,
): Promise<ExpenseCategory> {
  const response = await fetch(`${API_URL}/expense-categories/${id}`, {
    method: 'PATCH',
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response);
}

export async function deleteExpenseCategory(
  accessToken: string,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/expense-categories/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  await parseJsonOrThrow(response);
}
