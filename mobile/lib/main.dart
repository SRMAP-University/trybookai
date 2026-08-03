import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/providers/books_provider.dart';
import 'package:bookai_mobile/providers/public_books_provider.dart';
import 'package:bookai_mobile/routing/app_page.dart';
import 'package:bookai_mobile/services/api_client.dart';
import 'package:bookai_mobile/services/push_notifications.dart';
import 'package:bookai_mobile/services/revenuecat_service.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/screens/auth/login_screen.dart';
import 'package:bookai_mobile/screens/auth/register_screen.dart';
import 'package:bookai_mobile/screens/shell/main_shell.dart';
import 'package:bookai_mobile/screens/home/home_screen.dart';
import 'package:bookai_mobile/screens/books/books_screen.dart';
import 'package:bookai_mobile/screens/books/new_book_screen.dart';
import 'package:bookai_mobile/screens/books/book_detail_screen.dart';
import 'package:bookai_mobile/screens/discover/public_books_screen.dart';
import 'package:bookai_mobile/screens/discover/public_book_detail_screen.dart';
import 'package:bookai_mobile/screens/studio/audio_studio_screen.dart';
import 'package:bookai_mobile/screens/billing/billing_screen.dart';
import 'package:bookai_mobile/screens/account/account_screen.dart';
import 'package:bookai_mobile/screens/account/usage_screen.dart';
import 'package:bookai_mobile/screens/account/settings_screen.dart';
import 'package:bookai_mobile/screens/account/profile_screen.dart';
import 'package:bookai_mobile/screens/account/branding_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final push = PushNotificationService(api);
  await push.initialize();
  final revenueCat = RevenueCatService();
  await revenueCat.configure();
  final auth = AuthProvider(api, push: push, revenueCat: revenueCat);
  await auth.bootstrap();
  runApp(
    BookAiApp(api: api, auth: auth, push: push, revenueCat: revenueCat),
  );
}

class BookAiApp extends StatefulWidget {
  const BookAiApp({
    super.key,
    required this.api,
    required this.auth,
    required this.push,
    required this.revenueCat,
  });

  final ApiClient api;
  final AuthProvider auth;
  final PushNotificationService push;
  final RevenueCatService revenueCat;

  @override
  State<BookAiApp> createState() => _BookAiAppState();
}

class _BookAiAppState extends State<BookAiApp> {
  late final BooksProvider _books = BooksProvider(widget.api);
  late final PublicBooksProvider _public = PublicBooksProvider(widget.api);
  late final GoRouter _router = _buildRouter(widget.auth);

  @override
  void initState() {
    super.initState();
    widget.push.onNotificationTap = (bookId) {
      if (bookId == null || bookId.isEmpty) return;
      _router.go('/books/$bookId');
    };
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider.value(value: widget.api),
        Provider.value(value: widget.push),
        ChangeNotifierProvider.value(value: widget.revenueCat),
        ChangeNotifierProvider.value(value: widget.auth),
        ChangeNotifierProvider.value(value: _books),
        ChangeNotifierProvider.value(value: _public),
      ],
      child: MaterialApp.router(
        title: 'BookAI',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        routerConfig: _router,
      ),
    );
  }
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();

GoRouter _buildRouter(AuthProvider auth) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/home',
    refreshListenable: auth,
    redirect: (context, state) {
      final loading = auth.loading;
      final loggedIn = auth.isAuthenticated;
      final loc = state.matchedLocation;
      final isAuthRoute = loc == '/login' || loc == '/register';

      if (loading) return null;
      if (!loggedIn && !isAuthRoute) return '/login';
      if (loggedIn && isAuthRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) =>
            AppPage.fadeUp(state, const LoginScreen()),
      ),
      GoRoute(
        path: '/register',
        pageBuilder: (context, state) =>
            AppPage.fadeUp(state, const RegisterScreen()),
      ),
      GoRoute(
        path: '/billing',
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPage.slide(state, const BillingScreen()),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                pageBuilder: (context, state) =>
                    AppPage.none(state, const HomeScreen()),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/books',
                pageBuilder: (context, state) =>
                    AppPage.none(state, const BooksScreen()),
                routes: [
                  GoRoute(
                    path: 'new',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) =>
                        AppPage.slide(state, const NewBookScreen()),
                  ),
                  GoRoute(
                    path: ':id',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) => AppPage.slide(
                      state,
                      BookDetailScreen(
                        bookId: state.pathParameters['id']!,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/discover',
                pageBuilder: (context, state) =>
                    AppPage.none(state, const PublicBooksScreen()),
                routes: [
                  GoRoute(
                    path: ':slug',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) => AppPage.slide(
                      state,
                      PublicBookDetailScreen(
                        slug: state.pathParameters['slug']!,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studio',
                pageBuilder: (context, state) =>
                    AppPage.none(state, const AudioStudioScreen()),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                pageBuilder: (context, state) =>
                    AppPage.none(state, const AccountScreen()),
                routes: [
                  GoRoute(
                    path: 'usage',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) =>
                        AppPage.slide(state, const UsageScreen()),
                  ),
                  GoRoute(
                    path: 'settings',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) =>
                        AppPage.slide(state, const SettingsScreen()),
                  ),
                  GoRoute(
                    path: 'profile',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) =>
                        AppPage.slide(state, const ProfileScreen()),
                  ),
                  GoRoute(
                    path: 'branding',
                    parentNavigatorKey: _rootNavigatorKey,
                    pageBuilder: (context, state) =>
                        AppPage.slide(state, const BrandingScreen()),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/usage',
        redirect: (context, state) => '/account/usage',
      ),
      GoRoute(
        path: '/settings',
        redirect: (context, state) => '/account/settings',
      ),
    ],
  );
}
