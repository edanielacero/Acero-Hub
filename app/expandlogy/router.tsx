'use client'

import { createMiniAppRouter } from '@/components/mini-app-router'

/**
 * El router interno de Expandlogy. La mecánica vive en
 * components/mini-app-router y es la misma para las tres mini-apps; acá solo se
 * fija el base path.
 */
const router = createMiniAppRouter('/expandlogy')

export const ExpRouterProvider = router.Provider
export const ExpLink = router.Link
export const useExpPath = router.usePath
export const useExpRouter = router.useNav
