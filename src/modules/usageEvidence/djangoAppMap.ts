/**
 * Maps Django app / middleware module names to PyPI packages.
 * settingsOnly: true → presence in INSTALLED_APPS/MIDDLEWARE is strong usage evidence.
 * settingsOnly: false → settings presence is weak (may be configured but unused in code).
 */
export const DJANGO_APP_MAP: Record<string, { package: string; settingsOnly: boolean }> = {
  corsheaders: { package: 'django-cors-headers', settingsOnly: true },
  guardian: { package: 'django-guardian', settingsOnly: false },
  rest_framework_simplejwt: { package: 'djangorestframework-simplejwt', settingsOnly: true },
  drf_spectacular: { package: 'drf-spectacular', settingsOnly: true },
  rest_framework: { package: 'djangorestframework', settingsOnly: true },
  phonenumber_field: { package: 'django-phonenumber-field', settingsOnly: true },
  localflavor: { package: 'django-localflavor', settingsOnly: true },
  cities_light: { package: 'django-cities-light', settingsOnly: true },
  social_django: { package: 'social-auth-app-django', settingsOnly: true },
  djoser: { package: 'djoser', settingsOnly: true },
};
