import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';

type AppThunkDispatch = ThunkDispatch<unknown, unknown, UnknownAction>;

export const useAppDispatch = () => useDispatch<AppThunkDispatch>();
export const useAppSelector: TypedUseSelectorHook<unknown> = useSelector;

export function createTypedHooks<RootState>() {
  return {
    useAppDispatch: () => useDispatch<ThunkDispatch<RootState, unknown, UnknownAction>>(),
    useAppSelector: useSelector as TypedUseSelectorHook<RootState>,
  };
}
