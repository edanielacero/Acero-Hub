'use client'

import { createMiniAppRouter } from '@/components/mini-app-router'

const router = createMiniAppRouter('/ads-analizador')

export const AdsRouterProvider = router.Provider
export const AdsLink = router.Link
export const useAdsRouter = router.useNav
