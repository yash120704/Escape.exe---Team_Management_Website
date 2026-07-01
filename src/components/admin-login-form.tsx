"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn } from "lucide-react";

const formSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof formSchema>;

export default function AdminLoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    try {
      // First check if database is accessible
      const dbCheck = await fetch('/api/admin/check-db');
      const dbStatus = await dbCheck.json();
      console.log('Database status:', dbStatus);

      if (!dbCheck.ok) {
        throw new Error('Database connection failed. Please try again later.');
      }

      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      console.log('Login response:', { status: response.status, ok: response.ok });

      if (!response.ok) {
        throw new Error(result.message || "Login failed.");
      }
      
      toast({
        title: "Login Successful",
        description: "Redirecting to dashboard...",
      });

      // Wait a brief moment to ensure the cookie is set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use window.location for a full page refresh after login
      window.location.href = '/admin';

    } catch (error) {
      toast({
        variant: "destructive",
        title: "Login Error",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg shadow-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle>Admin Access</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="shadowmaster" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <LogIn className="mr-2"/>}
              Enter the Shadows
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
