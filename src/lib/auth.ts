import { supabase } from './supabase';

export async function signIn(email: string, password: string) {
  try {
    // First attempt to sign in
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (signInError) throw signInError;
    if (!authData.user) throw new Error('No user returned from sign in');

    // Get user's profile and role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        roles (
          id,
          name,
          permissions
        )
      `)
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      throw new Error('Failed to fetch user profile');
    }

    if (!profile) {
      console.error('No profile found');
      throw new Error('User profile not found');
    }

    return {
      user: authData.user,
      profile,
      session: authData.session
    };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

export async function updateUserPassword(userId: string, newPassword: string) {
  try {
    const { error } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating password:', error);
    throw error;
  }
}

export async function createUser(email: string, password: string, fullName: string, roleId: string) {
  try {
    const { data: userData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (signUpError) throw signUpError;
    if (!userData.user) throw new Error('Failed to create user');

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userData.user.id,
        full_name: fullName,
        role_id: roleId
      });

    if (profileError) throw profileError;

    return userData;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}