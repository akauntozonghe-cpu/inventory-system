import NotificationReadMarker from "@/components/pwa/NotificationReadMarker";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect,notFound} from "next/navigation";
import {AUTH_COOKIE,verifySessionToken} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {canViewNotification,notificationDestination} from "@/lib/notification-destination";
export default async function NotificationDetail({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const session=verifySessionToken((await cookies()).get(AUTH_COOKIE)?.value);if(!session)redirect("/login?returnTo="+encodeURIComponent("/notifications/"+id));
 const [user,note]=await Promise.all([prisma.appUser.findUnique({where:{id:session.id},select:{id:true,role:true,isActive:true,featurePermissions:true}}),prisma.notification.findUnique({where:{id}})]);
 if(!user?.isActive||!note||!canViewNotification(note,user))notFound();
 const action=notificationDestination(note,user);
 return <main className="mx-auto max-w-3xl p-4 sm:p-6"><NotificationReadMarker id={id}/><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{note.createdAt.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}</p><h1 className="my-3 text-2xl font-bold">{note.title}</h1><p className="whitespace-pre-wrap break-words">{note.message}</p><div className="mt-5 flex flex-wrap gap-3">{action&&<Link href={action.href} className="rounded-xl bg-blue-700 p-3 font-bold text-white">{action.label}</Link>}<Link href="/notifications" className="rounded-xl border p-3 font-bold">通知一覧へ戻る</Link></div>{!action&&<p className="mt-3 text-sm text-slate-600">通知の内容を確認してください。管理者による対応が必要な場合は管理者に連絡してください。</p>}</article></main>;
}
