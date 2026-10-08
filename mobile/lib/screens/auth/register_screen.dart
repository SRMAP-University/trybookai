import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:bookai_mobile/providers/auth_provider.dart';
import 'package:bookai_mobile/theme/app_theme.dart';
import 'package:bookai_mobile/widgets/auth_scaffold.dart';
import 'package:bookai_mobile/widgets/google_sign_in_button.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _googleLoading = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();
    final ok = await auth.register(
      name: _name.text,
      email: _email.text,
      password: _password.text,
    );
    if (!mounted) return;
    if (ok) {
      context.go('/books/new');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auth.error ?? 'Could not register')),
      );
    }
  }

  Future<void> _google() async {
    setState(() => _googleLoading = true);
    final auth = context.read<AuthProvider>();
    final ok = await auth.loginWithGoogle();
    if (!mounted) return;
    setState(() => _googleLoading = false);
    if (ok) {
      context.go(auth.pendingOnboarding ? '/books/new' : '/home');
    } else if (auth.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auth.error!)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final busy = auth.loading || _googleLoading;
    final bottom = MediaQuery.paddingOf(context).bottom;

    return AuthScaffold(
      brandLine: 'Start a book you can actually finish.',
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () => context.go('/login'),
      ),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.fromLTRB(24, 28, 24, 24 + bottom),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AuthHero(
                headline: 'Create your account',
                subtitle: 'A manuscript workspace, ready in a minute.',
              ),
              const SizedBox(height: 28),
              GoogleSignInButton(
                onPressed: busy ? null : _google,
                loading: _googleLoading,
              ),
              const SizedBox(height: 20),
              const AuthOrDivider(),
              const SizedBox(height: 20),
              AuthLabeledField(
                label: 'Name',
                child: TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  decoration: authInputDecoration(hintText: 'Your name'),
                  validator: (v) =>
                      v != null && v.trim().isNotEmpty ? null : 'Required',
                ),
              ),
              const SizedBox(height: 16),
              AuthLabeledField(
                label: 'Email',
                child: TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  decoration: authInputDecoration(hintText: 'you@email.com'),
                  validator: (v) => v != null && v.contains('@')
                      ? null
                      : 'Enter a valid email',
                ),
              ),
              const SizedBox(height: 16),
              AuthPasswordField(
                controller: _password,
                onSubmitted: (_) => _submit(),
                validator: (v) =>
                    v != null && v.length >= 8 ? null : 'Min 8 characters',
              ),
              const SizedBox(height: 22),
              AuthPrimaryButton(
                label: 'Create account',
                loading: auth.loading,
                onPressed: _submit,
              ),
              const SizedBox(height: 16),
              const AuthLegalNotice(
                actionLabel: 'By creating an account',
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.go('/login'),
                child: const Text.rich(
                  TextSpan(
                    text: 'Have an account? ',
                    style: TextStyle(color: AppColors.textMuted),
                    children: [
                      TextSpan(
                        text: 'Sign in',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
